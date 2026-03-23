import type { Lang } from './localize'

export const SIGNS_BY_LANG: Record<Lang, string[]> = {
  en: ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
       'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'],
  es: ['Aries','Tauro','Géminis','Cáncer','Leo','Virgo',
       'Libra','Escorpio','Sagitario','Capricornio','Acuario','Piscis'],
}

// Internal EN keys — used for all lookups, comparisons, and downstream logic
export const SIGNS = SIGNS_BY_LANG.en

export interface SignPosition {
  sign:          string   // always EN key — used for logic
  signLocalized: string   // display value in requested lang
  signIndex:     number
  degree:        number
  minute:        number
  second:        number
  formatted:     string   // uses localized sign name
}

export function lonToSign(lon: number, lang: Lang = 'en'): SignPosition {
  const normalized  = ((lon % 360) + 360) % 360
  const signIndex   = Math.floor(normalized / 30)
  const withinSign  = normalized - signIndex * 30
  const degree      = Math.floor(withinSign)
  const minFloat    = (withinSign - degree) * 60
  const minute      = Math.floor(minFloat)
  const second      = Math.floor((minFloat - minute) * 60)
  const signEn      = SIGNS_BY_LANG.en[signIndex]!
  const signLocal   = SIGNS_BY_LANG[lang][signIndex] ?? signEn
  return {
    sign:          signEn,
    signLocalized: signLocal,
    signIndex,
    degree,
    minute,
    second,
    formatted: `${signLocal} ${degree}°${String(minute).padStart(2, '0')}'`,
  }
}

// cusps is a 0-indexed 12-element array where cusps[0] = house 1 cusp
export function getHouse(lon: number, cusps: number[]): number {
  const norm = ((lon % 360) + 360) % 360
  for (let i = 0; i < 12; i++) {
    const next = (i + 1) % 12
    let c1 = cusps[i], c2 = cusps[next]
    if (c1 > c2) c2 += 360
    let l = norm
    if (l < c1) l += 360
    if (l >= c1 && l < c2) return i + 1
  }
  return 1
}

export const ASPECT_DEFS = [
  { name: 'Conjunction',  angle: 0,   orb: 6 },
  { name: 'Opposition',   angle: 180, orb: 6 },
  { name: 'Trine',        angle: 120, orb: 6 },
  { name: 'Square',       angle: 90,  orb: 5 },
  { name: 'Sextile',      angle: 60,  orb: 4 },
  { name: 'Quincunx',     angle: 150, orb: 3 },
  { name: 'Semi-sextile', angle: 30,  orb: 2 },
]

export interface Aspect {
  planet1: string
  planet2: string
  type: string
  orb: number
  applying: boolean
}

export function calculateAspects(
  positions: Array<{ name: string; lon: number; speed: number }>
): Aspect[] {
  const results: Aspect[] = []
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      let diff = Math.abs(positions[i].lon - positions[j].lon)
      if (diff > 180) diff = 360 - diff
      for (const asp of ASPECT_DEFS) {
        const orbVal = Math.abs(diff - asp.angle)
        if (orbVal <= asp.orb) {
          // applying if faster planet moving toward aspect
          const applying = positions[i].speed > positions[j].speed
            ? diff < asp.angle
            : diff > asp.angle
          results.push({
            planet1: positions[i].name,
            planet2: positions[j].name,
            type: asp.name,
            orb: Math.round(orbVal * 100) / 100,
            applying
          })
        }
      }
    }
  }
  return results.sort((a, b) => a.orb - b.orb)
}
