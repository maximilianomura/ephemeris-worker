import type { Lang } from './localize'

// ─── Sabian re-export ────────────────────────────────────────────────────────
export { getSabianSymbol } from './sabian'

// ─── Nakshatra ────────────────────────────────────────────────────────────────
const NAKSHATRAS = [
  { name: 'Ashwini',            ruler: 'Ketu',    deity: 'Ashwini Kumaras',              deityEs: 'Ashwini Kumaras' },
  { name: 'Bharani',            ruler: 'Venus',   deity: 'Yama',                         deityEs: 'Yama (dios de la muerte)' },
  { name: 'Krittika',           ruler: 'Sun',     deity: 'Agni',                         deityEs: 'Agni (dios del fuego)' },
  { name: 'Rohini',             ruler: 'Moon',    deity: 'Brahma',                       deityEs: 'Brahma (el creador)' },
  { name: 'Mrigashira',         ruler: 'Mars',    deity: 'Soma',                         deityEs: 'Soma (dios lunar)' },
  { name: 'Ardra',              ruler: 'Rahu',    deity: 'Rudra',                        deityEs: 'Rudra (dios de la tormenta)' },
  { name: 'Punarvasu',          ruler: 'Jupiter', deity: 'Aditi',                        deityEs: 'Aditi (diosa de la infinitud)' },
  { name: 'Pushya',             ruler: 'Saturn',  deity: 'Brihaspati',                   deityEs: 'Brihaspati (maestro de los dioses)' },
  { name: 'Ashlesha',           ruler: 'Mercury', deity: 'Nagas',                        deityEs: 'Nagas (serpientes divinas)' },
  { name: 'Magha',              ruler: 'Ketu',    deity: 'Pitrs',                        deityEs: 'Pitrs (ancestros)' },
  { name: 'Purva Phalguni',     ruler: 'Venus',   deity: 'Bhaga',                        deityEs: 'Bhaga (dios de la fortuna)' },
  { name: 'Uttara Phalguni',    ruler: 'Sun',     deity: 'Aryaman',                      deityEs: 'Aryaman (dios de la nobleza)' },
  { name: 'Hasta',              ruler: 'Moon',    deity: 'Savitar',                      deityEs: 'Savitar (dios solar)' },
  { name: 'Chitra',             ruler: 'Mars',    deity: 'Tvashtr',                      deityEs: 'Tvashtr (el artesano divino)' },
  { name: 'Swati',              ruler: 'Rahu',    deity: 'Vayu',                         deityEs: 'Vayu (dios del viento)' },
  { name: 'Vishakha',           ruler: 'Jupiter', deity: 'Indra-Agni',                   deityEs: 'Indra-Agni (fuego y tormenta)' },
  { name: 'Anuradha',           ruler: 'Saturn',  deity: 'Mitra',                        deityEs: 'Mitra (dios del pacto)' },
  { name: 'Jyeshtha',           ruler: 'Mercury', deity: 'Indra',                        deityEs: 'Indra (rey de los dioses)' },
  { name: 'Mula',               ruler: 'Ketu',    deity: 'Nirriti',                      deityEs: 'Nirriti (diosa de la disolución)' },
  { name: 'Purva Ashadha',      ruler: 'Venus',   deity: 'Apas',                         deityEs: 'Apas (diosa de las aguas)' },
  { name: 'Uttara Ashadha',     ruler: 'Sun',     deity: 'Vishvedevas',                  deityEs: 'Vishvedevas (todos los dioses)' },
  { name: 'Shravana',           ruler: 'Moon',    deity: 'Vishnu',                       deityEs: 'Vishnu (el preservador)' },
  { name: 'Dhanishtha',         ruler: 'Mars',    deity: 'Vasus',                        deityEs: 'Vasus (dioses de la abundancia)' },
  { name: 'Shatabhisha',        ruler: 'Rahu',    deity: 'Varuna',                       deityEs: 'Varuna (dios del cosmos)' },
  { name: 'Purva Bhadrapada',   ruler: 'Jupiter', deity: 'Ajaikapad',                    deityEs: 'Ajaikapad (dios del fuego místico)' },
  { name: 'Uttara Bhadrapada',  ruler: 'Saturn',  deity: 'Ahirbudhnya',                  deityEs: 'Ahirbudhnya (serpiente de las profundidades)' },
  { name: 'Revati',             ruler: 'Mercury', deity: 'Pushan',                       deityEs: 'Pushan (dios de los caminos)' },
]

export function getNakshatra(siderealLon: number, lang: Lang = 'en') {
  const normalized     = ((siderealLon % 360) + 360) % 360
  // Each nakshatra = 360/27 = 13°20'
  const nakshatraSpan = 360 / 27
  const index  = Math.floor(normalized / nakshatraSpan)
  const pada   = Math.floor((normalized % nakshatraSpan) / (nakshatraSpan / 4)) + 1
  const degWithin = normalized % nakshatraSpan
  return {
    name:    NAKSHATRAS[index]!.name,
    ruler:   NAKSHATRAS[index]!.ruler,
    deity:   lang === 'es' ? NAKSHATRAS[index]!.deityEs : NAKSHATRAS[index]!.deity,
    pada,
    index:   index + 1,
    degreeWithinNakshatra: Math.round(degWithin * 100) / 100
  }
}

// ─── Vimshottari Dasha ────────────────────────────────────────────────────────
const DASHA_SEQUENCE = [
  { planet: 'Ketu',    years: 7  },
  { planet: 'Venus',   years: 20 },
  { planet: 'Sun',     years: 6  },
  { planet: 'Moon',    years: 10 },
  { planet: 'Mars',    years: 7  },
  { planet: 'Rahu',    years: 18 },
  { planet: 'Jupiter', years: 16 },
  { planet: 'Saturn',  years: 19 },
  { planet: 'Mercury', years: 17 },
]

const nakshatraDashaRulers = [
  0,1,2,3,4,5,6,7,8, // Ashwini=Ketu, Bharani=Venus...
  0,1,2,3,4,5,6,7,8, // repeats
  0,1,2,3,4,5,6,7,8, // repeats
]

export function calculateDasha(siderealMoonLon: number, birthDate: string) {
  const normalized = ((siderealMoonLon % 360) + 360) % 360
  const nakshatraSpan = 360 / 27
  const nakshatraIndex = Math.floor(normalized / nakshatraSpan)
  const degWithin = normalized % nakshatraSpan
  const fractionElapsed = degWithin / nakshatraSpan

  const startDashaIndex = nakshatraDashaRulers[nakshatraIndex]!
  const startDasha = DASHA_SEQUENCE[startDashaIndex]!
  const yearsElapsedInStartDasha = fractionElapsed * startDasha.years
  const yearsRemainingInStartDasha = startDasha.years - yearsElapsedInStartDasha

  const birthMs = new Date(birthDate).getTime()
  const msPerYear = 365.25 * 24 * 3600 * 1000

  const dashas: Array<{
    planet: string; startDate: string; endDate: string
    years: number; partial: boolean; isCurrent?: boolean
  }> = []

  let firstEnd = new Date(birthMs + yearsRemainingInStartDasha * msPerYear)
  dashas.push({
    planet:    startDasha.planet,
    startDate: new Date(birthMs).toISOString().split('T')[0]!,
    endDate:   firstEnd.toISOString().split('T')[0]!,
    years:     Math.round(yearsRemainingInStartDasha * 100) / 100,
    partial:   true
  })

  let currentDate = firstEnd
  for (let i = 1; i < 9; i++) {
    const seq = (startDashaIndex + i) % 9
    const d = DASHA_SEQUENCE[seq]!
    const end = new Date(currentDate.getTime() + d.years * msPerYear)
    dashas.push({
      planet:    d.planet,
      startDate: currentDate.toISOString().split('T')[0]!,
      endDate:   end.toISOString().split('T')[0]!,
      years:     d.years,
      partial:   false
    })
    currentDate = end
  }

  const now = new Date()
  for (const d of dashas) {
    const s = new Date(d.startDate), e = new Date(d.endDate)
    d.isCurrent = now >= s && now <= e
  }

  return dashas
}

// ─── Secondary Progressions ──────────────────────────────────────────────────
// Day-for-a-year: 1 day after birth = 1 year of life
export function getProgressedDate(birthDate: string, targetAge: number): string {
  const birthMs = new Date(birthDate).getTime()
  const progressedMs = birthMs + targetAge * 24 * 3600 * 1000 // add days = years
  return new Date(progressedMs).toISOString().split('T')[0]!
}

// ─── Moon phase names ─────────────────────────────────────────────────────────
export function getMoonPhaseName(sunLon: number, moonLon: number): string {
  const diff = ((moonLon - sunLon) % 360 + 360) % 360
  if (diff < 22.5 || diff >= 337.5)  return 'New Moon'
  if (diff < 67.5)   return 'Waxing Crescent'
  if (diff < 112.5)  return 'First Quarter'
  if (diff < 157.5)  return 'Waxing Gibbous'
  if (diff < 202.5)  return 'Full Moon'
  if (diff < 247.5)  return 'Waning Gibbous'
  if (diff < 292.5)  return 'Last Quarter'
  return 'Waning Crescent'
}

// ─── Void of Course Moon ─────────────────────────────────────────────────────
// Moon is VOC after its last major aspect before leaving a sign
const MAJOR_ASPECT_ANGLES = [0, 60, 90, 120, 180]
const ASPECT_ORB = 1.0 // tight orb for VOC detection

export function isMoonInAspect(moonLon: number, planetLon: number): boolean {
  let diff = Math.abs(moonLon - planetLon) % 360
  if (diff > 180) diff = 360 - diff
  return MAJOR_ASPECT_ANGLES.some(a => Math.abs(diff - a) <= ASPECT_ORB)
}
