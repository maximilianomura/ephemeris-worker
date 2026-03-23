export type Lang = 'en' | 'es'

const PLANETS: Record<Lang, Record<string, string>> = {
  en: {
    Sun:     'Sun',
    Moon:    'Moon',
    Mercury: 'Mercury',
    Venus:   'Venus',
    Mars:    'Mars',
    Jupiter: 'Jupiter',
    Saturn:  'Saturn',
    Uranus:  'Uranus',
    Neptune: 'Neptune',
    Pluto:   'Pluto',
    NNode:   'North Node',
    Chiron:  'Chiron',
    Ascendant: 'Ascendant',
    Midheaven: 'Midheaven',
  },
  es: {
    Sun:     'Sol',
    Moon:    'Luna',
    Mercury: 'Mercurio',
    Venus:   'Venus',
    Mars:    'Marte',
    Jupiter: 'Júpiter',
    Saturn:  'Saturno',
    Uranus:  'Urano',
    Neptune: 'Neptuno',
    Pluto:   'Plutón',
    NNode:   'Nodo Norte',
    Chiron:  'Quirón',
    Ascendant: 'Ascendente',
    Midheaven: 'Medio Cielo',
  }
}

const SIGNS: Record<Lang, Record<string, string>> = {
  en: {
    Aries:       'Aries',
    Taurus:      'Taurus',
    Gemini:      'Gemini',
    Cancer:      'Cancer',
    Leo:         'Leo',
    Virgo:       'Virgo',
    Libra:       'Libra',
    Scorpio:     'Scorpio',
    Sagittarius: 'Sagittarius',
    Capricorn:   'Capricorn',
    Aquarius:    'Aquarius',
    Pisces:      'Pisces',
  },
  es: {
    Aries:       'Aries',
    Taurus:      'Tauro',
    Gemini:      'Géminis',
    Cancer:      'Cáncer',
    Leo:         'Leo',
    Virgo:       'Virgo',
    Libra:       'Libra',
    Scorpio:     'Escorpio',
    Sagittarius: 'Sagitario',
    Capricorn:   'Capricornio',
    Aquarius:    'Acuario',
    Pisces:      'Piscis',
  }
}

const ASPECTS: Record<Lang, Record<string, string>> = {
  en: {
    Conjunction:    'Conjunction',
    Opposition:     'Opposition',
    Trine:          'Trine',
    Square:         'Square',
    Sextile:        'Sextile',
    Quincunx:       'Quincunx',
    'Semi-sextile': 'Semi-sextile',
  },
  es: {
    Conjunction:    'Conjunción',
    Opposition:     'Oposición',
    Trine:          'Trígono',
    Square:         'Cuadratura',
    Sextile:        'Sextil',
    Quincunx:       'Quincuncio',
    'Semi-sextile': 'Semi-sextil',
  }
}

const HOUSE_LABEL: Record<Lang, string> = {
  en: 'House',
  es: 'Casa',
}

const MOON_PHASES: Record<Lang, Record<string, string>> = {
  en: {
    'New Moon':        'New Moon',
    'Waxing Crescent': 'Waxing Crescent',
    'First Quarter':   'First Quarter',
    'Waxing Gibbous':  'Waxing Gibbous',
    'Full Moon':       'Full Moon',
    'Waning Gibbous':  'Waning Gibbous',
    'Last Quarter':    'Last Quarter',
    'Waning Crescent': 'Waning Crescent',
  },
  es: {
    'New Moon':        'Luna Nueva',
    'Waxing Crescent': 'Luna Creciente',
    'First Quarter':   'Cuarto Creciente',
    'Waxing Gibbous':  'Gibosa Creciente',
    'Full Moon':       'Luna Llena',
    'Waning Gibbous':  'Gibosa Menguante',
    'Last Quarter':    'Cuarto Menguante',
    'Waning Crescent': 'Luna Menguante',
  }
}

const RETROGRADE_LABEL: Record<Lang, string> = {
  en: 'Retrograde',
  es: 'Retrógrado',
}

const APPLYING_LABEL: Record<Lang, Record<string, string>> = {
  en: { applying: 'applying', separating: 'separating' },
  es: { applying: 'aplicante', separating: 'separante' },
}

const DASHA_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    current: 'Current',
    past:    'Past',
    future:  'Future',
    partial: 'Partial (birth period)',
    years:   'years',
  },
  es: {
    current: 'Actual',
    past:    'Pasado',
    future:  'Futuro',
    partial: 'Parcial (período de nacimiento)',
    years:   'años',
  }
}

const ELECTIONAL_CRITERIA: Record<Lang, Record<string, string>> = {
  en: {
    moon_waxing:           'Waxing Moon',
    moon_waning:           'Waning Moon',
    no_mercury_retrograde: 'Mercury Direct',
    no_venus_retrograde:   'Venus Direct',
    no_mars_retrograde:    'Mars Direct',
    venus_direct:          'Venus Direct',
    full_moon:             'Full Moon',
    new_moon:              'New Moon',
  },
  es: {
    moon_waxing:           'Luna Creciente',
    moon_waning:           'Luna Menguante',
    no_mercury_retrograde: 'Mercurio Directo',
    no_venus_retrograde:   'Venus Directo',
    no_mars_retrograde:    'Marte Directo',
    venus_direct:          'Venus Directo',
    full_moon:             'Luna Llena',
    new_moon:              'Luna Nueva',
  }
}

function localizePosition(pos: any, lang: Lang): any {
  if (!pos) return pos
  const signLocal = SIGNS[lang][pos.sign] ?? pos.sign
  return {
    ...pos,
    signLocalized: signLocal,
    formatted: `${signLocal} ${pos.degree}°${String(pos.minute).padStart(2, '0')}'`
  }
}

export function localizeChart(chart: any, lang: Lang): any {
  if (lang === 'en') return chart
  return {
    ...chart,
    ascendant: localizePosition(chart.ascendant, lang),
    midheaven: localizePosition(chart.midheaven, lang),
    planets: chart.planets.map((p: any) => ({
      ...p,
      nameLocalized:   PLANETS[lang][p.name] ?? p.name,
      position:        localizePosition(p.position, lang),
      houseLabel:      `${HOUSE_LABEL[lang]} ${p.house}`,
      retrogradeLabel: p.retrograde ? RETROGRADE_LABEL[lang] : null,
    })),
    houses: chart.houses.map((h: any) => ({
      ...h,
      position:   localizePosition(h.position, lang),
      houseLabel: `${HOUSE_LABEL[lang]} ${h.house}`,
    })),
    aspects: chart.aspects.map((a: any) => ({
      ...a,
      planet1:       PLANETS[lang][a.planet1] ?? a.planet1,
      planet2:       PLANETS[lang][a.planet2] ?? a.planet2,
      type:          ASPECTS[lang][a.type]    ?? a.type,
      applyingLabel: APPLYING_LABEL[lang][a.applying ? 'applying' : 'separating'],
    })),
    meta: {
      ...chart.meta,
      houseLabel: HOUSE_LABEL[lang],
      lang,
    }
  }
}

export function localizePlanet(name: string, lang: Lang): string {
  return PLANETS[lang][name] ?? name
}

export function localizeSign(name: string, lang: Lang): string {
  return SIGNS[lang][name] ?? name
}

export function localizeAspect(type: string, lang: Lang): string {
  return ASPECTS[lang][type] ?? type
}

export function localizeMoonPhase(phase: string, lang: Lang): string {
  return MOON_PHASES[lang][phase] ?? phase
}

export function localizeDashas(dashas: any[], lang: Lang): any[] {
  if (lang === 'en') return dashas
  return dashas.map(d => ({
    ...d,
    planetLocalized: localizePlanet(d.planet, lang),
    statusLabel: d.isCurrent
      ? DASHA_LABELS[lang].current
      : new Date(d.endDate) < new Date()
        ? DASHA_LABELS[lang].past
        : DASHA_LABELS[lang].future,
    partialLabel: d.partial ? DASHA_LABELS[lang].partial : null,
    yearsLabel:   `${d.years} ${DASHA_LABELS[lang].years}`,
  }))
}

export function localizeElectionalCriteria(criteria: string[], lang: Lang): string[] {
  return criteria.map(c => ELECTIONAL_CRITERIA[lang][c] ?? c)
}

export function localizeElectionalResults(results: any[], lang: Lang): any[] {
  if (lang === 'en') return results
  return results.map(r => ({
    ...r,
    moonPhase:   localizeMoonPhase(r.moonPhase, lang),
    moonSign:    localizeSign(r.moonSign, lang),
    criteriamet: r.criteriaMet ? localizeElectionalCriteria(r.criteriaMet, lang) : undefined,
    criteriaMet: r.criteriaMet ? localizeElectionalCriteria(r.criteriaMet, lang) : undefined,
  }))
}

export function localizeVocPeriods(periods: any[], lang: Lang): any[] {
  if (lang === 'en') return periods
  const label = 'Luna Vacía de Curso'
  return periods.map(p => ({ ...p, label }))
}

export function localizeMoonPhases(phases: any[], lang: Lang): any[] {
  if (lang === 'en') return phases
  return phases.map(p => ({
    ...p,
    phase:        localizeMoonPhase(p.phase, lang),
    moonPosition: localizePositionString(p.moonPosition, lang),
    sunPosition:  localizePositionString(p.sunPosition, lang),
  }))
}

function localizePositionString(formatted: string, lang: Lang): string {
  if (lang === 'en') return formatted
  for (const [en, es] of Object.entries(SIGNS.es)) {
    if (formatted.startsWith(en)) return formatted.replace(en, es)
  }
  return formatted
}
