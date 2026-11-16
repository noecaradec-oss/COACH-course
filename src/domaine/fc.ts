// Fréquence cardiaque : estimation de la FC max et zones.

/**
 * FC max estimée par l'âge : 208 − 0,7 × âge. Tanaka, Monahan & Seals (2001),
 * J Am Coll Cardiol. L'écart individuel reste d'environ ±10 battements : une
 * FC max mesurée sur le terrain est toujours préférable.
 */
export function fcMaxEstimee(age: number): number {
  return Math.round(208 - 0.7 * age)
}

/**
 * Fraction de la réserve cardiaque : (FC − repos) / (max − repos).
 * Karvonen, Kentala & Mustala (1957). Bornée entre 0 et 1.
 */
export function fractionReserve(fc: number, fcRepos: number, fcMax: number): number {
  if (fcMax <= fcRepos) throw new Error('La FC max doit être supérieure à la FC de repos.')
  return Math.min(1, Math.max(0, (fc - fcRepos) / (fcMax - fcRepos)))
}

export interface ZoneFc {
  numero: 1 | 2 | 3 | 4 | 5
  nom: string
  min: number
  max: number
}

// Échelle à 5 zones de la fédération olympique norvégienne, en % de FC max,
// rapportée par Seiler (2010), Int J Sports Physiol Perform : 55–75, 75–85,
// 85–90, 90–95, 95–100. Bornes recoupées en ligne sur des sources
// secondaires, pas sur l'article.
const BORNES_ZONES = [0.55, 0.75, 0.85, 0.9, 0.95, 1]
const NOMS_ZONES = ['Endurance facile', 'Endurance active', 'Seuil', 'VO2max', 'Très intense']

export function zonesFc(fcMax: number): ZoneFc[] {
  return NOMS_ZONES.map((nom, i) => ({
    numero: (i + 1) as ZoneFc['numero'],
    nom,
    min: Math.round(BORNES_ZONES[i] * fcMax),
    max: Math.round(BORNES_ZONES[i + 1] * fcMax),
  }))
}

/** Indice de zone (0 à 4) d'une FC ; sous la zone 1, on compte en zone 1. */
export function indiceZone(fc: number, fcMax: number): number {
  const part = fc / fcMax
  for (let i = BORNES_ZONES.length - 2; i >= 1; i--) if (part >= BORNES_ZONES[i]) return i
  return 0
}
