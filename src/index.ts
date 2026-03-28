import { Hono }           from 'hono'
import { cors }           from 'hono/cors'
import { authMiddleware } from './middleware/auth'
import { calculateChart, type HouseSystem, type ZodiacType } from './lib/ephemeris'
import { geocodeCity }    from './lib/geocode'
import { lonToSign, calculateAspects, getHouse } from './lib/astro'
import { localizeChart, localizeDashas, localizeElectionalCriteria, localizeElectionalResults, localizeVocPeriods, localizeMoonPhases, localizePlanet, localizeAspect, type Lang } from './lib/localize'
// @ts-ignore — wrangler binds .wasm files as WebAssembly.Module
import wasmModule from '../public/swisseph.wasm'

type Env = { API_SECRET: string }

const app = new Hono<{ Bindings: Env }>()

// CORS — allow lumenastral.com and localhost
app.use('*', cors({
  origin: (origin) => {
    const allowed = [
      'https://lumenastral.com',
      'https://www.lumenastral.com',
      'http://localhost:5173',
      'http://localhost:8787',
      'https://ephemeris.myastralshop.com',
    ]
    return allowed.includes(origin) ? origin : 'https://lumenastral.com'
  },
  allowHeaders: ['X-API-Key', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}))

// ── UI route ─────────────────────────────────────────────────────────────────
app.get('/', (c) => {
  return c.html(UI_HTML)
})

// ── Public chart endpoint (no key required) ─────────────────────────────────
app.post('/chart', async (c) => {
  try {
    const body = await c.req.json() as {
      date: string
      time: string
      city?: string
      country?: string
      lat?: number
      lng?: number
      utcOffset: number
      houseSystem?: HouseSystem
      zodiac?: ZodiacType
      lang?: Lang
    }

    const { date, time, utcOffset, houseSystem, zodiac } = body
    if (!date || !time || utcOffset === undefined) {
      return c.json({ error: 'date, time and utcOffset are required' }, 400)
    }

    let lat: number, lng: number, locationName: string | undefined
    if (body.lat !== undefined && body.lng !== undefined) {
      lat = body.lat
      lng = body.lng
    } else if (body.city && body.country) {
      const geo = await geocodeCity(body.city, body.country)
      lat = geo.lat
      lng = geo.lng
      locationName = geo.displayName
    } else {
      return c.json({ error: 'Provide either lat+lng or city+country' }, 400)
    }

    const [yr, mo, dy] = date.split('-').map(Number)
    const [hr, mn] = time.split(':').map(Number)
    const utHour = (hr + mn / 60) - utcOffset
    const lang: Lang = body.lang ?? 'en'

    const chart = await calculateChart({ year: yr, month: mo, day: dy, hour: utHour, lat, lng, houseSystem, zodiac, lang })
    return c.json({ ok: true, location: locationName, chart: localizeChart(chart, lang), lang })
  } catch (err: any) {
    return c.json({ error: err.message ?? 'Calculation failed' }, 500)
  }
})

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/*', authMiddleware)

/**
 * POST /api/chart
 * Body: { date, time, city, country, utcOffset, houseSystem?, zodiac? }
 * Returns: full chart JSON
 */
app.post('/api/chart', async (c) => {
  try {
    const body = await c.req.json() as {
      date:         string   // "1984-07-05"
      time:         string   // "23:00"
      city?:        string
      country?:     string
      lat?:         number   // direct coords (optional — skips geocoding)
      lng?:         number
      utcOffset:    number   // hours, e.g. -4
      houseSystem?: HouseSystem
      zodiac?:      ZodiacType
      lang?:        Lang
    }

    const { date, time, utcOffset, houseSystem, zodiac } = body

    if (!date || !time || utcOffset === undefined) {
      return c.json({ error: 'date, time and utcOffset are required' }, 400)
    }

    // Resolve coordinates
    let lat: number, lng: number, locationName: string | undefined

    if (body.lat !== undefined && body.lng !== undefined) {
      lat = body.lat
      lng = body.lng
    } else if (body.city && body.country) {
      const geo = await geocodeCity(body.city, body.country)
      lat = geo.lat
      lng = geo.lng
      locationName = geo.displayName
    } else {
      return c.json({ error: 'Provide either lat+lng or city+country' }, 400)
    }

    // Parse date/time → UT
    const [yr, mo, dy] = date.split('-').map(Number)
    const [hr, mn]     = time.split(':').map(Number)
    const utHour       = (hr + mn / 60) - utcOffset

    const lang: Lang = body.lang ?? 'en'
    const chart = await calculateChart({
      year: yr, month: mo, day: dy, hour: utHour,
      lat, lng, houseSystem, zodiac, lang
    })

    return c.json({ ok: true, location: locationName, chart: localizeChart(chart, lang), lang })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Calculation failed'
    return c.json({ error: message }, 500)
  }
})

/**
 * GET /api/geocode?city=Santiago&country=Chile
 * Utility — lets frontend resolve coordinates before submitting chart
 */
app.get('/api/geocode', async (c) => {
  const city    = c.req.query('city')
  const country = c.req.query('country')
  if (!city || !country) return c.json({ error: 'city and country required' }, 400)
  try {
    const geo = await geocodeCity(city, country)
    return c.json({ ok: true, ...geo })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Geocoding failed'
    return c.json({ error: message }, 404)
  }
})

// Health check — no auth required
app.get('/health', (c) => c.json({ ok: true, service: 'ephemeris-worker' }))

// ── 1. NAKSHATRA ──────────────────────────────────────────────────────────────
app.post('/api/nakshatra', async (c) => {
  try {
    const body = await c.req.json() as {
      date: string; time: string
      city?: string; country?: string
      lat?: number; lng?: number
      utcOffset: number
      lang?: Lang
    }

    let lat: number, lng: number
    if (body.lat !== undefined && body.lng !== undefined) {
      lat = body.lat; lng = body.lng
    } else {
      const geo = await geocodeCity(body.city!, body.country!)
      lat = geo.lat; lng = geo.lng
    }
    const [yr,mo,dy] = body.date.split('-').map(Number)
    const [hr,mn]    = body.time.split(':').map(Number)
    const utHour     = (hr + mn/60) - body.utcOffset

    // @ts-ignore
    const SwissEphModule = await import('./vendor/swisseph.js')
    const SwissEph = (SwissEphModule as any).default ?? SwissEphModule
    const swe = new SwissEph()
    await swe.initSwissEph(wasmModule)
    swe.set_sid_mode(1, 0, 0) // Lahiri
    const jd   = swe.julday(yr, mo, dy, utHour)
    const moon = swe.calc_ut(jd, 1, 4 | 256) // sidereal flag
    swe.close()

    const lang: Lang = body.lang ?? 'en'
    const { getNakshatra } = await import('./lib/advanced')
    const nakshatra = getNakshatra(moon[0], lang)

    return c.json({ ok: true, siderealMoonLongitude: moon[0], nakshatra, lang })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ── 2. VIMSHOTTARI DASHA ──────────────────────────────────────────────────────
app.post('/api/dasha', async (c) => {
  try {
    const body = await c.req.json() as {
      date: string; time: string
      city?: string; country?: string
      lat?: number; lng?: number
      utcOffset: number
      lang?: Lang
    }

    let lat: number, lng: number
    if (body.lat !== undefined && body.lng !== undefined) {
      lat = body.lat; lng = body.lng
    } else {
      const geo = await geocodeCity(body.city!, body.country!)
      lat = geo.lat; lng = geo.lng
    }
    const [yr,mo,dy] = body.date.split('-').map(Number)
    const [hr,mn]    = body.time.split(':').map(Number)
    const utHour     = (hr + mn/60) - body.utcOffset

    // @ts-ignore
    const SwissEphModule = await import('./vendor/swisseph.js')
    const SwissEph = (SwissEphModule as any).default ?? SwissEphModule
    const swe = new SwissEph()
    await swe.initSwissEph(wasmModule)
    swe.set_sid_mode(1, 0, 0)
    const jd   = swe.julday(yr, mo, dy, utHour)
    const moon = swe.calc_ut(jd, 1, 4 | 256)
    swe.close()

    const lang: Lang = body.lang ?? 'en'
    const { calculateDasha, getNakshatra } = await import('./lib/advanced')
    const nakshatra = getNakshatra(moon[0], lang)
    const dashas    = localizeDashas(calculateDasha(moon[0], body.date), lang)
    const current   = dashas.find((d: any) => d.isCurrent)

    return c.json({ ok: true, nakshatra, dashas, currentDasha: current ?? null, lang })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ── 3. SECONDARY PROGRESSIONS ────────────────────────────────────────────────
app.post('/api/progressions', async (c) => {
  try {
    const body = await c.req.json() as {
      date: string; time: string
      city?: string; country?: string
      lat?: number; lng?: number
      utcOffset: number
      targetYear: number
      lang?: Lang
    }

    if (!body.targetYear) return c.json({ error: 'targetYear required' }, 400)

    let lat: number, lng: number
    if (body.lat !== undefined && body.lng !== undefined) {
      lat = body.lat; lng = body.lng
    } else {
      const geo = await geocodeCity(body.city!, body.country!)
      lat = geo.lat; lng = geo.lng
    }

    const birthYear = parseInt(body.date.split('-')[0]!)
    const age = body.targetYear - birthYear
    if (age < 0 || age > 120) return c.json({ error: 'targetYear out of range' }, 400)

    const { getProgressedDate } = await import('./lib/advanced')
    const progressedDate = getProgressedDate(body.date, age)

    const [yr,mo,dy] = progressedDate.split('-').map(Number)
    const [hr,mn]    = body.time.split(':').map(Number)
    const utHour     = (hr + mn/60) - body.utcOffset

    const progressedChart = await calculateChart({
      year: yr, month: mo, day: dy,
      hour: utHour, lat, lng,
      houseSystem: 'P', zodiac: 'tropical'
    })

    const natalChart = await calculateChart({
      year: parseInt(body.date.split('-')[0]!),
      month: parseInt(body.date.split('-')[1]!),
      day:   parseInt(body.date.split('-')[2]!),
      hour: utHour, lat, lng,
      houseSystem: 'P', zodiac: 'tropical'
    })

    const lang: Lang = body.lang ?? 'en'
    return c.json({
      ok: true,
      targetYear:      body.targetYear,
      age,
      progressedDate,
      natalChart:      localizeChart(natalChart, lang),
      progressedChart: localizeChart(progressedChart, lang),
      lang,
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ── 4. FIXED STAR CROSSINGS ──────────────────────────────────────────────────
// Fixed star tropical ecliptic longitudes at J2000.0 (JD 2451545.0).
// Source: Swiss Ephemeris / Robson star catalog values precessed to J2000.
// Precession rate: 50.29 arcsec/year forward in tropical longitude.
const FIXED_STARS_J2000: Record<string, number> = {
  Algol:       56.167,
  Alcyone:     60.000,
  Aldebaran:   69.783,
  Rigel:       76.833,
  Capella:     81.850,
  Betelgeuse:  88.750,
  Sirius:      104.083,
  Canopus:     104.967,
  Pollux:      113.217,
  Procyon:     115.783,
  Regulus:     149.833,
  Spica:       203.833,
  Arcturus:    204.233,
  Antares:     249.767,
  Vega:        285.317,
  Fomalhaut:   333.867,
  Deneb:       335.600,
  Achernar:    345.600,
}
// 50.29″ / 3600 / 365.25 = degrees per day
const PRECESS_PER_DAY = 50.29 / 3600 / 365.25

function gregorianToJD(year: number, month: number, day: number, hour: number): number {
  const a = Math.floor((14 - month) / 12)
  const y = year + 4800 - a
  const m = month + 12 * a - 3
  const jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y +
    Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045
  return jdn - 0.5 + hour / 24
}

app.post('/api/fixedstars', async (c) => {
  try {
    const body = await c.req.json() as {
      date: string; time: string
      city?: string; country?: string
      lat?: number; lng?: number
      utcOffset: number
      lang?: Lang
    }

    let lat: number, lng: number
    if (body.lat !== undefined && body.lng !== undefined) {
      lat = body.lat; lng = body.lng
    } else {
      const geo = await geocodeCity(body.city!, body.country!)
      lat = geo.lat; lng = geo.lng
    }

    const [yr,mo,dy] = body.date.split('-').map(Number)
    const [hr,mn]    = body.time.split(':').map(Number)
    const utHour     = (hr + mn/60) - body.utcOffset

    const jd = gregorianToJD(yr, mo, dy, utHour)
    const crossings: any[] = []
    const orb = 1.5
    const lang: Lang = body.lang ?? 'en'

    const chart = await calculateChart({ year: yr, month: mo, day: dy, hour: utHour, lat, lng })

    for (const [starName, lon2000] of Object.entries(FIXED_STARS_J2000)) {
      const starLon = ((lon2000 + (jd - 2451545.0) * PRECESS_PER_DAY) % 360 + 360) % 360

      for (const planet of chart.planets) {
        let diff = Math.abs(planet.longitude - starLon)
        if (diff > 180) diff = 360 - diff
        if (diff <= orb) {
          crossings.push({
            star:         starName,
            starLon:      Math.round(starLon * 100) / 100,
            starPosition: lonToSign(starLon).formatted,
            planet:       localizePlanet(planet.name, lang),
            orb:          Math.round(diff * 100) / 100
          })
        }
      }
    }

    return c.json({ ok: true, crossings: crossings.sort((a,b) => a.orb - b.orb), lang })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ── 5. VOID OF COURSE MOON CALENDAR ─────────────────────────────────────────
app.post('/api/voc', async (c) => {
  try {
    const body = await c.req.json() as { startDate: string; endDate: string; lang?: Lang }
    const { validateRange, dateRangeToJDs } = await import('./lib/ranges')
    validateRange(body, 31)

    // @ts-ignore
    const SwissEphModule = await import('./vendor/swisseph.js')
    const SwissEph = (SwissEphModule as any).default ?? SwissEphModule
    const swe = new SwissEph()
    await swe.initSwissEph(wasmModule)

    const PLANET_IDS = [0,2,3,4,5,6] // Sun,Mercury,Venus,Mars,Jupiter,Saturn
    const ASPECT_ANGLES = [0,60,90,120,180]
    const ORB = 1.0
    const jds = dateRangeToJDs(body.startDate, body.endDate, 1) // hourly

    const vocPeriods: any[] = []
    let vocStart: string | null = null

    for (const jd of jds) {
      const moon = swe.calc_ut(jd, 1, 4)
      const moonLon = moon[0]

      let hasAspect = false
      for (const pid of PLANET_IDS) {
        const planet = swe.calc_ut(jd, pid, 4)
        let diff = Math.abs(moonLon - planet[0]) % 360
        if (diff > 180) diff = 360 - diff
        if (ASPECT_ANGLES.some(a => Math.abs(diff - a) <= ORB)) {
          hasAspect = true
          break
        }
      }

      const ms = (jd - 2440587.5) * 86400000
      const dateStr = new Date(ms).toISOString()

      if (!hasAspect && vocStart === null) {
        vocStart = dateStr
      } else if (hasAspect && vocStart !== null) {
        vocPeriods.push({ start: vocStart, end: dateStr })
        vocStart = null
      }
    }

    swe.close()
    const lang: Lang = body.lang ?? 'en'
    return c.json({ ok: true, vocPeriods: localizeVocPeriods(vocPeriods, lang), lang })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ── 6. MOON PHASES ───────────────────────────────────────────────────────────
app.post('/api/moonphases', async (c) => {
  try {
    const body = await c.req.json() as { startDate: string; endDate: string; lang?: Lang }
    const { validateRange, dateRangeToJDs } = await import('./lib/ranges')
    validateRange(body, 90)

    // @ts-ignore
    const SwissEphModule = await import('./vendor/swisseph.js')
    const SwissEph = (SwissEphModule as any).default ?? SwissEphModule
    const swe = new SwissEph()
    await swe.initSwissEph(wasmModule)

    const { getMoonPhaseName } = await import('./lib/advanced')

    const jds = dateRangeToJDs(body.startDate, body.endDate, 6) // every 6 hours
    const phases: any[] = []
    let lastPhase = ''

    for (const jd of jds) {
      const sun  = swe.calc_ut(jd, 0, 4)
      const moon = swe.calc_ut(jd, 1, 4)
      const phase = getMoonPhaseName(sun[0], moon[0])

      if (phase !== lastPhase) {
        const ms = (jd - 2440587.5) * 86400000
        phases.push({
          phase,
          date:         new Date(ms).toISOString().split('T')[0],
          moonPosition: lonToSign(moon[0]).formatted,
          sunPosition:  lonToSign(sun[0]).formatted,
          illumination: Math.round((1 - Math.cos((moon[0]-sun[0]) * Math.PI / 180)) / 2 * 100)
        })
        lastPhase = phase
      }
    }

    swe.close()
    const lang: Lang = body.lang ?? 'en'
    return c.json({ ok: true, phases: localizeMoonPhases(phases, lang), lang })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ── 7. SABIAN SYMBOLS ────────────────────────────────────────────────────────
app.post('/api/sabian', async (c) => {
  try {
    const body = await c.req.json() as {
      date: string; time: string
      city?: string; country?: string
      lat?: number; lng?: number
      utcOffset: number
      lang?: Lang
    }

    let lat: number, lng: number
    if (body.lat !== undefined && body.lng !== undefined) {
      lat = body.lat; lng = body.lng
    } else {
      const geo = await geocodeCity(body.city!, body.country!)
      lat = geo.lat; lng = geo.lng
    }

    const [yr,mo,dy] = body.date.split('-').map(Number)
    const [hr,mn]    = body.time.split(':').map(Number)
    const utHour     = (hr + mn/60) - body.utcOffset

    const chart = await calculateChart({ year: yr, month: mo, day: dy, hour: utHour, lat, lng })
    const { getSabianSymbol } = await import('./lib/advanced')
    const lang: Lang = body.lang ?? 'en'

    const ascLon = chart.ascendant.signIndex * 30 + chart.ascendant.degree
    const mcLon  = chart.midheaven.signIndex * 30 + chart.midheaven.degree

    const sabians = [
      ...chart.planets.map(p => ({
        point:     localizePlanet(p.name, lang),
        longitude: p.longitude,
        ...getSabianSymbol(p.longitude, lang)
      })),
      { point: localizePlanet('Ascendant', lang), longitude: ascLon, ...getSabianSymbol(ascLon, lang) },
      { point: localizePlanet('Midheaven', lang), longitude: mcLon,  ...getSabianSymbol(mcLon, lang)  },
    ]

    return c.json({ ok: true, sabians, lang })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ── 8. ASTROCARTOGRAPHY ──────────────────────────────────────────────────────
app.post('/api/astrocarto', async (c) => {
  try {
    const body = await c.req.json() as {
      date: string; time: string
      birthLat: number; birthLng: number
      utcOffset: number
      targetLat: number
      targetLng: number
      orbKm?: number
      lang?: Lang
    }

    if (body.targetLat === undefined || body.targetLng === undefined) {
      return c.json({ error: 'targetLat and targetLng required' }, 400)
    }

    const [yr,mo,dy] = body.date.split('-').map(Number)
    const [hr,mn]    = body.time.split(':').map(Number)
    const utHour     = (hr + mn/60) - body.utcOffset

    // @ts-ignore
    const SwissEphModule = await import('./vendor/swisseph.js')
    const SwissEph = (SwissEphModule as any).default ?? SwissEphModule
    const swe = new SwissEph()
    await swe.initSwissEph(wasmModule)
    const jd = swe.julday(yr, mo, dy, utHour)

    const PLANETS_ACGR = [
      { id: 0, name: 'Sun' }, { id: 1, name: 'Moon' },
      { id: 2, name: 'Mercury' }, { id: 3, name: 'Venus' },
      { id: 4, name: 'Mars' }, { id: 5, name: 'Jupiter' },
      { id: 6, name: 'Saturn' }, { id: 7, name: 'Uranus' },
      { id: 8, name: 'Neptune' }, { id: 9, name: 'Pluto' },
    ]

    const lines: any[] = []
    const ORB_KM = body.orbKm ?? 750
    const latRad = body.targetLat * Math.PI / 180
    const lang: Lang = body.lang ?? 'en'

    // GMST in degrees — direct formula, avoids swe.sidtime reliability issues
    const T = (jd - 2451545.0) / 36525.0
    const gmstDeg = ((280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T) % 360 + 360) % 360

    // Mean obliquity of ecliptic in radians
    const epsRad = (23.439291111 - 0.013004167 * T) * Math.PI / 180

    const checkLine = (lineLon: number, planet: string, lineType: string) => {
      const lonDiff = ((body.targetLng - lineLon + 180) % 360 + 360) % 360 - 180
      const approxKm = Math.abs(lonDiff) * 111 * Math.cos(latRad)
      if (approxKm <= ORB_KM) {
        lines.push({
          planet:        localizePlanet(planet, lang),
          lineType,
          lineLongitude: Math.round(lineLon * 100) / 100,
          distanceKm:    Math.round(approxKm),
        })
      }
    }

    for (const p of PLANETS_ACGR) {
      try {
        // SEFLG_MOSEPH(4) only — same flags as calculateChart, confirmed working
        // Returns [ecliptic_lon, ecliptic_lat, dist, speed_lon, speed_lat, speed_dist]
        const pos    = swe.calc_ut(jd, p.id, 4)
        const lonRad = pos[0] * Math.PI / 180  // ecliptic longitude
        const latP   = pos[1] * Math.PI / 180  // ecliptic latitude

        // Ecliptic → equatorial
        const raDeg = ((Math.atan2(
          Math.sin(lonRad) * Math.cos(epsRad) - Math.tan(latP) * Math.sin(epsRad),
          Math.cos(lonRad)
        ) * 180 / Math.PI) + 360) % 360
        const dec = Math.asin(
          Math.sin(latP) * Math.cos(epsRad) + Math.cos(latP) * Math.sin(epsRad) * Math.sin(lonRad)
        )

        // MC: LST = RA at that meridian  →  lng_MC = RA − GMST
        const mcLon = ((raDeg - gmstDeg) % 360 + 360) % 360
        const icLon = (mcLon + 180) % 360
        checkLine(mcLon, p.name, 'MC')
        checkLine(icLon, p.name, 'IC')

        // ASC/DSC: hour angle at horizon  cos(H) = -tan(lat)·tan(dec)
        const cosH = -Math.tan(latRad) * Math.tan(dec)
        if (Math.abs(cosH) <= 1) {
          const H      = Math.acos(cosH) * 180 / Math.PI
          const ascLon = ((raDeg - gmstDeg - H) % 360 + 360) % 360
          const dscLon = ((raDeg - gmstDeg + H) % 360 + 360) % 360
          checkLine(ascLon, p.name, 'ASC')
          checkLine(dscLon, p.name, 'DSC')
        }
      } catch { /* circumpolar or calc error — skip */ }
    }

    swe.close()
    return c.json({
      ok: true,
      targetLocation: { lat: body.targetLat, lng: body.targetLng },
      activeLines: lines.sort((a,b) => a.distanceKm - b.distanceKm),
      lang,
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ── 9. ELECTIONAL ASTROLOGY ──────────────────────────────────────────────────
app.post('/api/electional', async (c) => {
  try {
    const body = await c.req.json() as {
      startDate: string
      endDate:   string
      lat:       number
      lng:       number
      criteria?: string[]
      lang?:     Lang
    }

    const { validateRange, dateRangeToJDs } = await import('./lib/ranges')
    validateRange(body, 90)

    const criteria = body.criteria ?? ['moon_waxing', 'no_mercury_retrograde']

    // @ts-ignore
    const SwissEphModule = await import('./vendor/swisseph.js')
    const SwissEph = (SwissEphModule as any).default ?? SwissEphModule
    const swe = new SwissEph()
    await swe.initSwissEph(wasmModule)

    const { getMoonPhaseName } = await import('./lib/advanced')

    const jds = dateRangeToJDs(body.startDate, body.endDate, 12) // every 12 hours
    const favorable: any[] = []

    for (const jd of jds) {
      const sun     = swe.calc_ut(jd, 0, 4)
      const moon    = swe.calc_ut(jd, 1, 4)
      const mercury = swe.calc_ut(jd, 2, 4)
      const venus   = swe.calc_ut(jd, 3, 4)
      const mars    = swe.calc_ut(jd, 4, 4)

      const moonPhase  = getMoonPhaseName(sun[0], moon[0])
      const moonWaxing = ['Waxing Crescent','First Quarter','Waxing Gibbous','Full Moon'].includes(moonPhase)
      const mercuryRx  = mercury[3] < 0
      const venusRx    = venus[3] < 0
      const marsRx     = mars[3] < 0

      const checks: Record<string, boolean> = {
        moon_waxing:           moonWaxing,
        moon_waning:           !moonWaxing,
        no_mercury_retrograde: !mercuryRx,
        no_venus_retrograde:   !venusRx,
        no_mars_retrograde:    !marsRx,
        venus_direct:          !venusRx,
        full_moon:             moonPhase === 'Full Moon',
        new_moon:              moonPhase === 'New Moon',
      }

      const score  = criteria.filter(cr => checks[cr] === true).length
      const allMet = score === criteria.length

      if (allMet) {
        const ms = (jd - 2440587.5) * 86400000
        favorable.push({
          date:        new Date(ms).toISOString().split('T')[0],
          time:        new Date(ms).toISOString().split('T')[1]!.slice(0,5) + ' UTC',
          moonPhase,
          moonSign:    lonToSign(moon[0]).sign,
          score,
          criteriaMet: criteria.filter(cr => checks[cr])
        })
      }
    }

    swe.close()

    // Deduplicate by date (keep first hit per day)
    const seen = new Set<string>()
    const deduplicated = favorable.filter(f => {
      if (seen.has(f.date)) return false
      seen.add(f.date)
      return true
    })

    const lang: Lang = body.lang ?? 'en'
    return c.json({
      ok: true,
      criteria:       localizeElectionalCriteria(criteria, lang),
      favorableDates: localizeElectionalResults(deduplicated.slice(0, 30), lang),
      lang,
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ── 10. SOLAR RETURN ────────────────────────────────────────────────────────
app.post('/api/solar-return', async (c) => {
  try {
    const body = await c.req.json() as {
      date: string; time: string
      city?: string; country?: string
      lat?: number; lng?: number
      utcOffset: number
      targetYear: number
      returnLat?: number; returnLng?: number
      houseSystem?: HouseSystem
      lang?: Lang
    }

    if (!body.date || !body.time || body.utcOffset === undefined) {
      return c.json({ error: 'date, time and utcOffset are required' }, 400)
    }
    if (!body.targetYear || !Number.isInteger(body.targetYear)) {
      return c.json({ error: 'targetYear is required (integer)' }, 400)
    }

    let lat: number, lng: number
    if (body.lat !== undefined && body.lng !== undefined) {
      lat = body.lat; lng = body.lng
    } else if (body.city && body.country) {
      const geo = await geocodeCity(body.city, body.country)
      lat = geo.lat; lng = geo.lng
    } else {
      return c.json({ error: 'Provide either lat+lng or city+country' }, 400)
    }

    const returnLat = body.returnLat ?? lat
    const returnLng = body.returnLng ?? lng

    const [byr, bmo, bdy] = body.date.split('-').map(Number)
    const [bhr, bmn]      = body.time.split(':').map(Number)
    const birthUtHour     = (bhr + bmn / 60) - body.utcOffset

    // @ts-ignore
    const SwissEphModule = await import('./vendor/swisseph.js')
    const SwissEph = (SwissEphModule as any).default ?? SwissEphModule
    const swe = new SwissEph()
    await swe.initSwissEph(wasmModule)

    const birthJD     = swe.julday(byr, bmo, bdy, birthUtHour)
    const natalSunLon = swe.calc_ut(birthJD, 0, 260)[0]  // Sun tropical longitude

    // Normalize angle diff to (-180, 180] for bracket detection
    const normDiff = (a: number, b: number): number => {
      let d = ((a - b) % 360 + 360) % 360
      if (d > 180) d -= 360
      return d
    }

    // Search entire targetYear + 10 days into next year (handles Dec/Jan boundary)
    const searchStart = swe.julday(body.targetYear, 1, 1, 0)
    const searchEnd   = swe.julday(body.targetYear + 1, 1, 10, 0)

    let returnJD: number | null = null
    let prevDiff = normDiff(swe.calc_ut(searchStart, 0, 260)[0], natalSunLon)

    for (let jd = searchStart + 1; jd <= searchEnd; jd += 1) {
      const curDiff = normDiff(swe.calc_ut(jd, 0, 260)[0], natalSunLon)
      if (prevDiff < 0 && curDiff >= 0) {
        // Binary search within [jd-1, jd] to sub-minute precision
        let lo = jd - 1, hi = jd
        for (let iter = 0; iter < 50; iter++) {
          const mid     = (lo + hi) / 2
          const midDiff = normDiff(swe.calc_ut(mid, 0, 260)[0], natalSunLon)
          if (Math.abs(midDiff) < 0.00001) { returnJD = mid; break }
          if (midDiff < 0) lo = mid; else hi = mid
        }
        if (returnJD === null) returnJD = (lo + hi) / 2
        break
      }
      prevDiff = curDiff
    }

    swe.close()

    if (returnJD === null) {
      return c.json({ error: `Could not find solar return in year ${body.targetYear}` }, 400)
    }

    const returnMs  = (returnJD - 2440587.5) * 86400000
    const dt        = new Date(returnMs)
    const returnDate = dt.toISOString().split('T')[0]!
    const returnTime = dt.toISOString().split('T')[1]!.slice(0, 5) + ' UTC'
    const rhr = dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600

    const lang: Lang = body.lang ?? 'en'
    const returnChart = await calculateChart({
      year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate(),
      hour: rhr, lat: returnLat, lng: returnLng,
      houseSystem: body.houseSystem, lang,
    })

    return c.json({
      ok: true,
      returnDate,
      returnTime,
      natalSun:    lonToSign(natalSunLon, lang),
      returnChart: localizeChart(returnChart, lang),
      lang,
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ── 11. LUNAR RETURN ─────────────────────────────────────────────────────────
app.post('/api/lunar-return', async (c) => {
  try {
    const body = await c.req.json() as {
      date: string; time: string
      city?: string; country?: string
      lat?: number; lng?: number
      utcOffset: number
      targetMonth: string   // "YYYY-MM"
      returnLat?: number; returnLng?: number
      houseSystem?: HouseSystem
      lang?: Lang
    }

    if (!body.date || !body.time || body.utcOffset === undefined) {
      return c.json({ error: 'date, time and utcOffset are required' }, 400)
    }
    if (!body.targetMonth || !/^\d{4}-\d{2}$/.test(body.targetMonth)) {
      return c.json({ error: 'targetMonth is required in YYYY-MM format' }, 400)
    }

    let lat: number, lng: number
    if (body.lat !== undefined && body.lng !== undefined) {
      lat = body.lat; lng = body.lng
    } else if (body.city && body.country) {
      const geo = await geocodeCity(body.city, body.country)
      lat = geo.lat; lng = geo.lng
    } else {
      return c.json({ error: 'Provide either lat+lng or city+country' }, 400)
    }

    const returnLat = body.returnLat ?? lat
    const returnLng = body.returnLng ?? lng

    const [byr, bmo, bdy] = body.date.split('-').map(Number)
    const [bhr, bmn]      = body.time.split(':').map(Number)
    const birthUtHour     = (bhr + bmn / 60) - body.utcOffset

    // @ts-ignore
    const SwissEphModule = await import('./vendor/swisseph.js')
    const SwissEph = (SwissEphModule as any).default ?? SwissEphModule
    const swe = new SwissEph()
    await swe.initSwissEph(wasmModule)

    const birthJD      = swe.julday(byr, bmo, bdy, birthUtHour)
    const natalMoonLon = swe.calc_ut(birthJD, 1, 260)[0]  // Moon tropical longitude

    const [myr, mon] = body.targetMonth.split('-').map(Number)
    const nextMon    = mon === 12 ? 1     : mon + 1
    const nextYr     = mon === 12 ? myr + 1 : myr
    // Search 2 days before month start → 5 days after month end (handles boundary returns)
    const searchStart = swe.julday(myr, mon, 1, 0) - 2
    const searchEnd   = swe.julday(nextYr, nextMon, 5, 0)

    const normDiff = (a: number, b: number): number => {
      let d = ((a - b) % 360 + 360) % 360
      if (d > 180) d -= 360
      return d
    }

    const stepJD = 2 / 24  // 2-hour steps — Moon moves ~1° per 2h, step < 1° so bracket is tight
    let returnJD: number | null = null
    let prevDiff = normDiff(swe.calc_ut(searchStart, 1, 260)[0], natalMoonLon)

    for (let jd = searchStart + stepJD; jd <= searchEnd; jd += stepJD) {
      const curDiff = normDiff(swe.calc_ut(jd, 1, 260)[0], natalMoonLon)
      if (prevDiff < 0 && curDiff >= 0) {
        let lo = jd - stepJD, hi = jd
        for (let iter = 0; iter < 50; iter++) {
          const mid     = (lo + hi) / 2
          const midDiff = normDiff(swe.calc_ut(mid, 1, 260)[0], natalMoonLon)
          if (Math.abs(midDiff) < 0.00001) { returnJD = mid; break }
          if (midDiff < 0) lo = mid; else hi = mid
        }
        if (returnJD === null) returnJD = (lo + hi) / 2
        break
      }
      prevDiff = curDiff
    }

    swe.close()

    if (returnJD === null) {
      return c.json({ error: `No lunar return found in ${body.targetMonth}` }, 400)
    }

    const returnMs   = (returnJD - 2440587.5) * 86400000
    const dt         = new Date(returnMs)
    const returnDate = dt.toISOString().split('T')[0]!
    const returnTime = dt.toISOString().split('T')[1]!.slice(0, 5) + ' UTC'
    const rhr = dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600

    const lang: Lang = body.lang ?? 'en'
    const returnChart = await calculateChart({
      year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate(),
      hour: rhr, lat: returnLat, lng: returnLng,
      houseSystem: body.houseSystem, lang,
    })

    return c.json({
      ok: true,
      returnDate,
      returnTime,
      natalMoon:   lonToSign(natalMoonLon, lang),
      returnChart: localizeChart(returnChart, lang),
      lang,
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ── 12. SYNASTRY ─────────────────────────────────────────────────────────────
app.post('/api/synastry', async (c) => {
  try {
    const body = await c.req.json() as {
      person1: {
        date: string; time: string; utcOffset: number
        lat?: number; lng?: number; city?: string; country?: string
      }
      person2: {
        date: string; time: string; utcOffset: number
        lat?: number; lng?: number; city?: string; country?: string
      }
      houseSystem?: HouseSystem
      lang?: Lang
    }

    if (!body.person1 || !body.person2) {
      return c.json({ error: 'person1 and person2 are required' }, 400)
    }

    const lang: Lang       = body.lang ?? 'en'
    const houseSystem      = body.houseSystem ?? 'P'
    type PersonInput       = typeof body.person1

    const resolveCoords = async (p: PersonInput): Promise<{ lat: number; lng: number }> => {
      if (p.lat !== undefined && p.lng !== undefined) return { lat: p.lat, lng: p.lng }
      if (p.city && p.country) {
        const geo = await geocodeCity(p.city, p.country)
        return { lat: geo.lat, lng: geo.lng }
      }
      throw new Error('Each person requires lat+lng or city+country')
    }

    const toUTHour = (time: string, utcOffset: number): number => {
      const [h, m] = time.split(':').map(Number)
      return (h + m / 60) - utcOffset
    }

    const [coords1, coords2] = await Promise.all([
      resolveCoords(body.person1),
      resolveCoords(body.person2),
    ])

    const [yr1, mo1, dy1] = body.person1.date.split('-').map(Number)
    const [yr2, mo2, dy2] = body.person2.date.split('-').map(Number)

    // Calculate both natal charts in parallel
    const [chart1, chart2] = await Promise.all([
      calculateChart({
        year: yr1, month: mo1, day: dy1,
        hour: toUTHour(body.person1.time, body.person1.utcOffset),
        lat: coords1.lat, lng: coords1.lng, houseSystem, lang,
      }),
      calculateChart({
        year: yr2, month: mo2, day: dy2,
        hour: toUTHour(body.person2.time, body.person2.utcOffset),
        lat: coords2.lat, lng: coords2.lng, houseSystem, lang,
      }),
    ])

    // ── Cross-aspects (synastry orbs wider than natal) ──────────────────────
    const SYNASTRY_ASPECTS = [
      { name: 'Conjunction',  angle: 0,   orb: 8 },
      { name: 'Opposition',   angle: 180, orb: 8 },
      { name: 'Trine',        angle: 120, orb: 6 },
      { name: 'Square',       angle: 90,  orb: 7 },
      { name: 'Sextile',      angle: 60,  orb: 6 },
      { name: 'Quincunx',     angle: 150, orb: 3 },
      { name: 'Semi-sextile', angle: 30,  orb: 2 },
    ]

    const crossAspects: Array<{
      planet1: string; planet2: string; type: string; orb: number; applying: boolean
    }> = []

    for (const p1 of chart1.planets) {
      for (const p2 of chart2.planets) {
        let diff = Math.abs(p1.longitude - p2.longitude)
        if (diff > 180) diff = 360 - diff
        for (const asp of SYNASTRY_ASPECTS) {
          const orbVal = Math.abs(diff - asp.angle)
          if (orbVal <= asp.orb) {
            crossAspects.push({
              planet1:  localizePlanet(p1.name, lang),
              planet2:  localizePlanet(p2.name, lang),
              type:     localizeAspect(asp.name, lang),
              orb:      Math.round(orbVal * 100) / 100,
              applying: p1.speed > 0 ? diff < asp.angle : diff > asp.angle,
            })
          }
        }
      }
    }
    crossAspects.sort((a, b) => a.orb - b.orb)

    // ── Composite chart (midpoint method) ────────────────────────────────────
    // Midpoint longitude using the shorter arc between two zodiac positions
    const midpointLon = (a: number, b: number): number => {
      const diff = Math.abs(a - b)
      const mid  = (a + b) / 2
      return diff > 180 ? (mid + 180) % 360 : mid
    }

    // Composite JD = midpoint of both birth JDs — used for house calculation
    const compositeJD = (chart1.julianDay + chart2.julianDay) / 2

    // Calculate composite house cusps at midpoint JD, person1's location
    // @ts-ignore
    const SwissEphModule2 = await import('./vendor/swisseph.js')
    const SwissEph2 = (SwissEphModule2 as any).default ?? SwissEphModule2
    const swe2 = new SwissEph2()
    await swe2.initSwissEph(wasmModule)
    const compHouseData = swe2.houses(compositeJD, coords1.lat, coords1.lng, houseSystem)
    const compAscLon    = compHouseData.ascmc[0] as number
    const compMcLon     = compHouseData.ascmc[1] as number
    const compCusps     = Array.from(compHouseData.cusps as ArrayLike<number>).slice(1, 13) as number[]
    swe2.close()

    // Build composite planets from midpoint longitudes
    const compPlanets = chart1.planets.map((p1, i) => {
      const p2     = chart2.planets[i]!
      const compLon = midpointLon(p1.longitude, p2.longitude)
      return {
        name:          p1.name,
        nameLocalized: localizePlanet(p1.name, lang),
        symbol:        p1.symbol,
        longitude:     compLon,
        latitude:      0,
        speed:         (p1.speed + p2.speed) / 2,
        retrograde:    false,
        position:      lonToSign(compLon, lang),
        house:         getHouse(compLon, compCusps),
      }
    })

    const compHouses = compCusps.map((cusp, i) => ({
      house:    i + 1,
      cusp,
      position: lonToSign(cusp, lang),
    }))

    const compAspects = calculateAspects(
      compPlanets.map(p => ({ name: p.name, lon: p.longitude, speed: 0 }))
    ).map(a => ({
      ...a,
      planet1: localizePlanet(a.planet1, lang),
      planet2: localizePlanet(a.planet2, lang),
      type:    localizeAspect(a.type, lang),
    }))

    const compositeChart = {
      ascendant:  lonToSign(compAscLon, lang),
      midheaven:  lonToSign(compMcLon, lang),
      planets:    compPlanets,
      houses:     compHouses,
      aspects:    compAspects,
      julianDay:  compositeJD,
      meta: {
        houseSystem,
        zodiac:      'tropical',
        lang,
        method:      'midpoint',
        calculatedAt: new Date().toISOString(),
      },
    }

    return c.json({
      ok:            true,
      person1Chart:  localizeChart(chart1, lang),
      person2Chart:  localizeChart(chart2, lang),
      crossAspects,
      compositeChart,
      lang,
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ── 12. TRANSITS — current sky snapshot for a given date ──────────────────────
// Returns all 10 planets for noon UTC on `date`, with speeds and retrograde flags.
// Also scans 120 days forward to find each planet's next direction-change station.
// Used by daily-horoscope (today's sky vs natal) and mercury-retrograde reports.
app.post('/api/transits', async (c) => {
  try {
    const body = await c.req.json() as { date: string; lang?: Lang }
    if (!body.date) return c.json({ error: 'date is required' }, 400)

    const parts = body.date.split('-').map(Number)
    const [yr, mo, dy] = parts
    if (!yr || !mo || !dy) return c.json({ error: 'invalid date — use YYYY-MM-DD' }, 400)

    const utHour = 12 // noon UTC — standard reference for daily transits
    const lang: Lang = body.lang ?? 'en'

    // @ts-ignore
    const SwissEphModule = await import('./vendor/swisseph.js')
    const SwissEph = (SwissEphModule as any).default ?? SwissEphModule
    const swe = new SwissEph()
    await swe.initSwissEph(wasmModule)

    const SEFLG_MOSEPH = 4
    const SEFLG_SPEED  = 256
    const flag = SEFLG_MOSEPH | SEFLG_SPEED

    const PLANET_IDS: Array<{ id: number; key: string }> = [
      { id: 0, key: 'Sun'     },
      { id: 1, key: 'Moon'    },
      { id: 2, key: 'Mercury' },
      { id: 3, key: 'Venus'   },
      { id: 4, key: 'Mars'    },
      { id: 5, key: 'Jupiter' },
      { id: 6, key: 'Saturn'  },
      { id: 7, key: 'Uranus'  },
      { id: 8, key: 'Neptune' },
      { id: 9, key: 'Pluto'   },
    ]

    const jdNow = swe.julday(yr, mo, dy, utHour)

    // Calculate each planet's position + speed
    const planets: any[] = []
    for (const { id, key } of PLANET_IDS) {
      const pos = swe.calc_ut(jdNow, id, flag)
      // pos = [lon, lat, dist, speed_lon, speed_lat, speed_dist]
      const isRetrograde = pos[3] < 0
      const lonPos = lonToSign(pos[0], lang)
      planets.push({
        key,
        name:             localizePlanet(key, lang),
        longitude:        Math.round(pos[0] * 10000) / 10000,
        speed:            Math.round(pos[3] * 10000) / 10000,
        retrograde:       isRetrograde,
        position: {
          sign:      lonPos.sign,         // always English key
          formatted: lonPos.formatted,    // localized display string
        },
        retrogradeSymbol: isRetrograde ? '℞' : '',
      })
    }

    // Scan forward up to 120 days for the next direction-change station per planet
    type Station = { type: 'retrograde' | 'direct'; date: string; position: string }
    const nextStation: Record<string, Station | null> = {}

    for (const { id, key } of PLANET_IDS) {
      if (key === 'Sun' || key === 'Moon') {
        nextStation[key] = null  // no retrograde stations
        continue
      }
      const currentRetro = swe.calc_ut(jdNow, id, flag)[3] < 0
      let found: Station | null = null
      for (let d = 1; d <= 120; d++) {
        const jdScan = jdNow + d
        const posScan = swe.calc_ut(jdScan, id, flag)
        if ((posScan[3] < 0) !== currentRetro) {
          const ms = (jdScan - 2440587.5) * 86400000
          found = {
            type:     posScan[3] < 0 ? 'retrograde' : 'direct',
            date:     new Date(ms).toISOString().split('T')[0]!,
            position: lonToSign(posScan[0], lang).formatted,
          }
          break
        }
      }
      nextStation[key] = found
    }

    swe.close()
    return c.json({ ok: true, date: body.date, planets, nextStation, lang })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

export default app

// ── Inline UI ─────────────────────────────────────────────────────────────────
// Self-contained HTML — no external dependencies
const UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Swiss Ephemeris — Natal Chart Calculator</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0f0f1a;color:#e8e6f0;min-height:100vh;padding:2rem 1rem}
  .container{max-width:640px;margin:0 auto}
  h1{font-size:1.4rem;font-weight:500;margin-bottom:0.25rem;color:#c4b5fd}
  .sub{font-size:0.8rem;color:#6b7280;margin-bottom:2rem}
  .card{background:#1a1a2e;border:1px solid #2d2d4e;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem}
  label{display:block;font-size:0.75rem;color:#9ca3af;margin-bottom:4px;margin-top:12px}
  label:first-child{margin-top:0}
  input,select{width:100%;padding:8px 10px;background:#0f0f1a;border:1px solid #2d2d4e;border-radius:6px;color:#e8e6f0;font-size:0.875rem}
  input:focus,select:focus{outline:none;border-color:#7c3aed}
  .row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
  button{width:100%;margin-top:1.5rem;padding:10px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-size:0.9rem;cursor:pointer}
  button:hover{background:#6d28d9}
  button:disabled{opacity:0.5;cursor:not-allowed}
  .key-row{display:flex;gap:8px;align-items:flex-end}
  .key-row input{flex:1}
  .key-row button{width:auto;margin-top:0;padding:8px 14px;font-size:0.8rem}
  .result-section{margin-top:1rem}
  .result-section h2{font-size:0.85rem;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px}
  .highlights{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:1rem}
  .hl{background:#0f0f1a;border-radius:8px;padding:10px;text-align:center}
  .hl-label{font-size:0.7rem;color:#6b7280;margin-bottom:2px}
  .hl-val{font-size:0.9rem;color:#c4b5fd;font-weight:500}
  .planet-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .planet-item{display:flex;justify-content:space-between;padding:6px 10px;background:#0f0f1a;border-radius:6px;font-size:0.8rem}
  .p-name{color:#9ca3af}
  .p-pos{color:#e8e6f0}
  .p-house{color:#6b7280;font-size:0.7rem}
  .house-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
  .house-item{background:#0f0f1a;border-radius:6px;padding:6px;text-align:center;font-size:0.75rem}
  .h-num{color:#6b7280;font-size:0.65rem}
  .h-sign{color:#e8e6f0;font-weight:500}
  .asp-list{font-size:0.8rem}
  .asp-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1f1f35}
  .asp-row:last-child{border:none}
  .asp-type{font-weight:500}
  .conj{color:#60a5fa}.opp{color:#f87171}.trine{color:#4ade80}.square{color:#fb923c}.sext{color:#34d399}.quinc{color:#a78bfa}.semi{color:#94a3b8}
  .copy-btn{width:auto;margin-top:8px;padding:6px 14px;font-size:0.75rem;background:transparent;border:1px solid #2d2d4e;color:#9ca3af}
  .copy-btn:hover{background:#1a1a2e;color:#e8e6f0}
  .error{color:#f87171;font-size:0.8rem;padding:8px;background:#1f0f0f;border-radius:6px;margin-top:8px}
  .loading{color:#9ca3af;font-size:0.85rem;text-align:center;padding:1rem}
  .badge{display:inline-block;font-size:0.65rem;padding:2px 8px;background:#1e1b4b;color:#a5b4fc;border-radius:4px;margin-left:8px;vertical-align:middle}
  a{color:#7c3aed;font-size:0.75rem}
</style>
</head>
<body>
<div class="container">
  <h1>Swiss Ephemeris <span class="badge">AGPL-3.0</span></h1>
  <p class="sub">Free natal chart API · <a href="https://github.com/maximilianomura/ephemeris-worker" target="_blank">Source on GitHub</a></p>

  <div class="card">
    <div class="row2" style="margin-top:0">
      <div>
        <label>Birth date</label>
        <input type="date" id="bdate" value="1984-07-05">
      </div>
      <div>
        <label>Birth time (local)</label>
        <input type="time" id="btime" value="23:00">
      </div>
    </div>
    <div class="row2">
      <div>
        <label>City</label>
        <input type="text" id="bcity" value="Santiago">
      </div>
      <div>
        <label>Country</label>
        <input type="text" id="bcountry" value="Chile">
      </div>
    </div>
    <div class="row3">
      <div>
        <label>UTC offset</label>
        <input type="number" id="butc" value="-4" step="0.5" min="-12" max="14">
      </div>
      <div>
        <label>House system</label>
        <select id="bhsys">
          <option value="P">Placidus</option>
          <option value="K">Koch</option>
          <option value="W">Whole sign</option>
          <option value="E">Equal</option>
          <option value="R">Regiomontanus</option>
        </select>
      </div>
      <div>
        <label>Zodiac</label>
        <select id="bzod">
          <option value="tropical">Tropical</option>
          <option value="sidereal">Sidereal</option>
        </select>
      </div>
    </div>
    <div class="row2" style="margin-top:12px">
      <div>
        <label>Language / Idioma</label>
        <select id="blang">
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </div>
    </div>
    <button id="calcBtn" onclick="calculate()">Calculate natal chart</button>
    <div id="status"></div>
  </div>

  <div id="results" style="display:none">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2 style="margin:0">Chart highlights</h2>
        <button class="copy-btn" onclick="copyJSON()" id="copyJsonBtn" style="display:none">Copy JSON</button>
      </div>
      <div class="highlights" id="highlights" style="margin-top:12px"></div>
      <div class="result-section">
        <h2>Planetary positions</h2>
        <div class="planet-grid" id="planets"></div>
      </div>
      <div class="result-section" style="margin-top:1rem">
        <h2>House cusps</h2>
        <div class="house-grid" id="houses"></div>
      </div>
      <div class="result-section" style="margin-top:1rem">
        <h2>Major aspects</h2>
        <div class="asp-list" id="aspects"></div>
      </div>
    </div>
  </div>
</div>

<script>
let chartJSON = null

async function calculate() {
  const btn = document.getElementById('calcBtn')
  const status = document.getElementById('status')
  btn.disabled = true
  status.innerHTML = '<div class="loading">Calculating...</div>'
  document.getElementById('results').style.display = 'none'

  const body = {
    date:       document.getElementById('bdate').value,
    time:       document.getElementById('btime').value,
    city:       document.getElementById('bcity').value,
    country:    document.getElementById('bcountry').value,
    utcOffset:  parseFloat(document.getElementById('butc').value),
    houseSystem:document.getElementById('bhsys').value,
    zodiac:     document.getElementById('bzod').value,
    lang:       document.getElementById('blang').value
  }

  try {
    const res = await fetch('/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed')
    chartJSON = data.chart
    render(data.chart)
    status.innerHTML = ''
  } catch(e) {
    status.innerHTML = '<div class="error">' + e.message + '</div>'
  }
  btn.disabled = false
}

const ASP_COLORS = { Conjunction:'conj', Opposition:'opp', Trine:'trine', Square:'square', Sextile:'sext', Quincunx:'quinc', 'Semi-sextile':'semi' }

function render(c) {
  document.getElementById('highlights').innerHTML = [
    ['Ascendant', c.ascendant.formatted],
    ['Midheaven', c.midheaven.formatted],
    ['Julian day', c.julianDay]
  ].map(([l,v]) => \`<div class="hl"><div class="hl-label">\${l}</div><div class="hl-val">\${v}</div></div>\`).join('')

  document.getElementById('planets').innerHTML = c.planets.map(p =>
    \`<div class="planet-item">
      <span class="p-name">\${p.symbol} \${p.nameLocalized ?? p.name}\${p.retrograde?' ℞':''}</span>
      <span><span class="p-pos">\${p.position.formatted}</span> <span class="p-house">H\${p.house}</span></span>
    </div>\`
  ).join('')

  document.getElementById('houses').innerHTML = c.houses.map(h =>
    \`<div class="house-item"><div class="h-num">H\${h.house}</div><div class="h-sign">\${h.position.sign}</div><div style="font-size:0.65rem;color:#6b7280">\${h.position.degree}\xb0\${String(h.position.minute).padStart(2,'0')}'</div></div>\`
  ).join('')

  document.getElementById('aspects').innerHTML = c.aspects.slice(0,20).map(a =>
    \`<div class="asp-row">
      <span>\${a.planet1} \u2014 \${a.planet2}</span>
      <span class="asp-type \${ASP_COLORS[a.type]||''}">\${a.type}</span>
      <span style="color:#6b7280">\${a.orb}\xb0 \${a.applying?'app':'sep'}</span>
    </div>\`
  ).join('')

  document.getElementById('results').style.display = 'block'
}

if (new URLSearchParams(location.search).has('json')) {
  document.getElementById('copyJsonBtn').style.display = ''
}

function copyJSON() {
  if (!chartJSON) return
  navigator.clipboard.writeText(JSON.stringify(chartJSON, null, 2))
  const btn = document.querySelector('.copy-btn')
  btn.textContent = 'Copied!'
  setTimeout(() => btn.textContent = 'Copy JSON', 1500)
}
</script>
</body>
</html>`
