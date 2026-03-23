import { lonToSign, getHouse, calculateAspects, type SignPosition, type Aspect } from './astro'
import type { Lang } from './localize'
// Wrangler treats .wasm file imports as WebAssembly.Module bindings.
// This lets us bypass relative-URL fetch() inside the Emscripten factory,
// which fails in CF Workers where import.meta.url is not a file:// URL.
// @ts-ignore
import wasmModule from '../../public/swisseph.wasm'

// Planet IDs as defined by Swiss Ephemeris
const PLANET_LIST = [
  { id: 0,  name: 'Sun',     nameEs: 'Sol',        symbol: '☉' },
  { id: 1,  name: 'Moon',    nameEs: 'Luna',       symbol: '☽' },
  { id: 2,  name: 'Mercury', nameEs: 'Mercurio',   symbol: '☿' },
  { id: 3,  name: 'Venus',   nameEs: 'Venus',      symbol: '♀' },
  { id: 4,  name: 'Mars',    nameEs: 'Marte',      symbol: '♂' },
  { id: 5,  name: 'Jupiter', nameEs: 'Júpiter',    symbol: '♃' },
  { id: 6,  name: 'Saturn',  nameEs: 'Saturno',    symbol: '♄' },
  { id: 7,  name: 'Uranus',  nameEs: 'Urano',      symbol: '♅' },
  { id: 8,  name: 'Neptune', nameEs: 'Neptuno',    symbol: '♆' },
  { id: 9,  name: 'Pluto',   nameEs: 'Plutón',     symbol: '♇' },
  { id: 11, name: 'NNode',   nameEs: 'Nodo Norte', symbol: '☊' },
  { id: 15, name: 'Chiron',  nameEs: 'Quirón',     symbol: '⚷' },
]

// Swiss Ephemeris flag constants
const SEFLG_MOSEPH  = 4       // Moshier built-in ephemeris (no external files needed in Workers)
const SEFLG_SPEED   = 256     // Include speed in longitude
const SEFLG_SIDEREAL = 65536  // Sidereal zodiac

export type HouseSystem = 'P' | 'K' | 'W' | 'E' | 'O' | 'R'
export type ZodiacType  = 'tropical' | 'sidereal'

export interface ChartInput {
  year:         number
  month:        number
  day:          number
  hour:         number   // decimal UT hour (already converted from local)
  lat:          number
  lng:          number
  houseSystem?: HouseSystem
  zodiac?:      ZodiacType
  lang?:        Lang
}

export interface PlanetData {
  name:          string
  nameLocalized: string
  symbol:        string
  longitude:     number
  latitude:      number
  speed:         number
  retrograde:    boolean
  position:      SignPosition
  house:         number
}

export interface ChartOutput {
  ascendant:  SignPosition
  midheaven:  SignPosition
  planets:    PlanetData[]
  houses:     Array<{ house: number; cusp: number; position: SignPosition }>
  aspects:    Aspect[]
  julianDay:  number
  meta: {
    houseSystem:  string
    zodiac:       string
    lang:         Lang
    calculatedAt: string
  }
}

export async function calculateChart(input: ChartInput): Promise<ChartOutput> {
  // Use the vendored (patched) swisseph.js which fixes locateFile for CF Workers.
  // The patch makes locateFile return '/swisseph.wasm' and '/swisseph.data' so
  // the WASM loader fetches them from the Worker's static assets (public/ dir).
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — vendored JS, no companion .d.ts file
  const SwissEphModule = await import('../vendor/swisseph.js')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SwissEphClass = (SwissEphModule as any).default ?? SwissEphModule
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const swe = new (SwissEphClass as any)()
  await swe.initSwissEph(wasmModule)

  const hsys   = input.houseSystem ?? 'P'
  const zodiac = input.zodiac ?? 'tropical'
  const lang   = input.lang   ?? 'en'

  // Always include SEFLG_MOSEPH (built-in) and SEFLG_SPEED (for retrograde/aspects)
  const flag = zodiac === 'sidereal'
    ? SEFLG_MOSEPH | SEFLG_SPEED | SEFLG_SIDEREAL
    : SEFLG_MOSEPH | SEFLG_SPEED

  if (zodiac === 'sidereal') {
    swe.set_sid_mode(1, 0, 0) // SE_SIDM_LAHIRI = 1
  }

  const jd = swe.julday(input.year, input.month, input.day, input.hour)

  // Calculate planetary positions
  const planets: PlanetData[] = []
  for (const p of PLANET_LIST) {
    try {
      // calc_ut returns Float64Array: [lon, lat, dist, speedLon, speedLat, speedDist]
      const pos = swe.calc_ut(jd, p.id, flag) as Float64Array
      const signPos = lonToSign(pos[0], lang)
      planets.push({
        name:          p.name,
        nameLocalized: lang === 'es' ? p.nameEs : p.name,
        symbol:        p.symbol,
        longitude:     Math.round(pos[0] * 10000) / 10000,
        latitude:      Math.round(pos[1] * 10000) / 10000,
        speed:         Math.round(pos[3] * 10000) / 10000,
        retrograde:    pos[3] < 0,
        position:      signPos,
        house:         0 // filled after house calc
      })
    } catch {
      // skip planets that fail (e.g. Chiron on very old dates)
    }
  }

  // Calculate houses
  // houses() returns { cusps: Float64Array[13], ascmc: Float64Array[10] }
  //   cusps[1..12] = house cusps (index 0 is unused)
  //   ascmc[0] = ascendant, ascmc[1] = midheaven
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const houseResult = swe.houses(jd, input.lat, input.lng, hsys) as any
  // Extract 12 house cusps as 0-indexed array: cuspsArr[0] = house 1 cusp
  const cuspsArr: number[] = Array.from(houseResult.cusps as Float64Array).slice(1, 13) as number[]

  // Assign houses to planets
  planets.forEach(p => { p.house = getHouse(p.longitude, cuspsArr) })

  swe.close()

  const ascLon = (houseResult.ascmc as Float64Array)[0]
  const mcLon  = (houseResult.ascmc as Float64Array)[1]

  return {
    ascendant: lonToSign(ascLon, lang),
    midheaven: lonToSign(mcLon, lang),
    planets,
    houses: cuspsArr.map((cusp, i) => ({
      house:    i + 1,
      cusp:     Math.round(cusp * 10000) / 10000,
      position: lonToSign(cusp, lang)
    })),
    aspects: calculateAspects(
      planets.map(p => ({ name: p.name, lon: p.longitude, speed: p.speed }))
    ),
    julianDay: Math.round(jd * 100000) / 100000,
    meta: {
      houseSystem: hsys,
      zodiac,
      lang,
      calculatedAt: new Date().toISOString()
    }
  }
}
