// Charge d'entraînement et signaux d'alerte.

/**
 * Charge d'une séance = ressenti (RPE, échelle 0–10) × durée en minutes.
 * Foster et al. (2001), « A new approach to monitoring exercise training »,
 * J Strength Cond Res.
 */
export function chargeSeance(rpe: number, dureeMin: number): number {
  return rpe * dureeMin
}

function moyenne(valeurs: number[]): number {
  return valeurs.reduce((s, v) => s + v, 0) / valeurs.length
}

/**
 * Monotonie d'une semaine = moyenne des charges des 7 jours / leur écart-type
 * (jours de repos comptés à 0). Foster (1998), Med Sci Sports Exerc.
 * Renvoie null si toutes les journées sont identiques (écart-type nul).
 */
export function monotonie(chargesDes7Jours: number[]): number | null {
  if (chargesDes7Jours.length !== 7) throw new Error('Il faut les 7 jours de la semaine.')
  const m = moyenne(chargesDes7Jours)
  const ecartType = Math.sqrt(moyenne(chargesDes7Jours.map((c) => (c - m) ** 2)))
  return ecartType === 0 ? null : m / ecartType
}

/** Contrainte (« strain ») = charge de la semaine × monotonie. Foster (1998). */
export function contrainte(chargesDes7Jours: number[]): number | null {
  const mono = monotonie(chargesDes7Jours)
  return mono === null ? null : chargesDes7Jours.reduce((s, c) => s + c, 0) * mono
}

// Foster (1998) associe une monotonie supérieure à 2 à davantage de
// maladies et de surmenage. Repère, pas un seuil médical.
export const SEUIL_MONOTONIE = 2

/**
 * Impulsion d'entraînement (TRIMP) par la FC :
 * durée (min) × x × a × e^(b·x), où x est la fraction de réserve cardiaque.
 * a = 0,64 et b = 1,92 pour les hommes ; a = 0,86 et b = 1,67 pour les femmes.
 * Banister (1991), dans « Physiological Testing of the High-Performance
 * Athlete ». Constantes recoupées en ligne sur des sources secondaires.
 */
export function trimp(dureeMin: number, fractionReserveCardiaque: number, sexe: 'femme' | 'homme'): number {
  const [a, b] = sexe === 'femme' ? [0.86, 1.67] : [0.64, 1.92]
  return dureeMin * fractionReserveCardiaque * a * Math.exp(b * fractionReserveCardiaque)
}

/**
 * Hausse du kilométrage hebdomadaire jugée trop rapide.
 *
 * Nielsen et al. (2014), J Orthop Sports Phys Ther, 874 coureurs débutants :
 * ceux qui augmentaient de plus de 30 % sur deux semaines avaient plus de
 * blessures liées à la distance que ceux restant sous 10 %. L'écart global
 * n'était pas statistiquement significatif (p = 0,07) : c'est un repère de
 * prudence. La règle des « 10 % par semaine » n'a pas montré d'effet
 * protecteur (Buist et al., 2008, Am J Sports Med).
 */
export const SEUIL_HAUSSE_KM = 0.3

/** Variation relative du kilométrage ; null si la semaine précédente est vide. */
export function variationHebdo(kmSemainePrecedente: number, kmSemaine: number): number | null {
  if (kmSemainePrecedente <= 0) return null
  return (kmSemaine - kmSemainePrecedente) / kmSemainePrecedente
}

export function hausseTropRapide(kmSemainePrecedente: number, kmSemaine: number): boolean {
  const variation = variationHebdo(kmSemainePrecedente, kmSemaine)
  return variation !== null && variation > SEUIL_HAUSSE_KM
}

export type CategorieIntensite = 'facile' | 'seuil' | 'intense'

export interface Repartition {
  facile: number
  seuil: number
  intense: number
  total: number
}

/**
 * Répartition des séances par intensité dominante (méthode « but de séance »).
 * Seiler & Kjerland (2006), Scand J Med Sci Sports : les athlètes d'endurance
 * de haut niveau font environ 75–80 % de séances faciles. Confirmé en
 * comparaison de méthodes par Stöggl & Sperlich (2014), Front Physiol.
 */
export function repartirIntensites(categories: CategorieIntensite[]): Repartition {
  const r: Repartition = { facile: 0, seuil: 0, intense: 0, total: categories.length }
  for (const c of categories) r[c]++
  return r
}

// Sous 75 % de séances faciles, on s'écarte de ce qu'observent
// Seiler & Kjerland (2006). On attend 8 séances pour juger.
export const PART_FACILE_MIN = 0.75
export const SEANCES_MIN_POUR_JUGER = 8

export function tropPeuDeFacile(r: Repartition): boolean {
  return r.total >= SEANCES_MIN_POUR_JUGER && r.facile / r.total < PART_FACILE_MIN
}
