// Évaluation du niveau : d'une course ou d'un test de terrain vers VDOT et VMA.

import type { DateIso } from './dates'
import type { Evaluation, TypeEvaluation } from './modele'
import { VERSION_DONNEES } from './modele'
import { DUREE_VMA_MIN, calculerVdot, vmaDepuisVdot } from './vdot'

export type SaisieEvaluation =
  /** Course ou chrono récent. */
  | { type: 'course'; distanceM: number; dureeS: number }
  /**
   * Demi-Cooper : distance maximale parcourue en 6 minutes. Variante
   * française du test de 12 min de Cooper (1968, JAMA) ; la vitesse moyenne
   * tenue 6 min est prise comme VMA (voir vdot.ts, Billat & Koralsztein, 1996).
   */
  | { type: 'demiCooper'; distanceM: number }
  /**
   * VAMEVAL (Cazorla & Léger, 1993) : test progressif sur piste, +0,5 km/h
   * par minute. On saisit la vitesse du dernier palier terminé, qui est la
   * VMA. Elle est convertie en VDOT en la traitant comme un effort de 6 min :
   * approximation d'entraîneur (voir vdot.ts).
   */
  | { type: 'vameval'; vitessePalierKmh: number }

export function evaluer(saisie: SaisieEvaluation, date: DateIso, id: string, note = ''): Evaluation {
  let distanceM: number
  let dureeS: number
  if (saisie.type === 'course') {
    distanceM = saisie.distanceM
    dureeS = saisie.dureeS
  } else if (saisie.type === 'demiCooper') {
    distanceM = saisie.distanceM
    dureeS = DUREE_VMA_MIN * 60
  } else {
    dureeS = DUREE_VMA_MIN * 60
    distanceM = (saisie.vitessePalierKmh * 1000 * DUREE_VMA_MIN) / 60
  }
  const vdot = calculerVdot(distanceM, dureeS)
  const type: TypeEvaluation = saisie.type
  return {
    id,
    version: VERSION_DONNEES,
    date,
    type,
    distanceM: Math.round(distanceM),
    dureeS: Math.round(dureeS),
    vdot: Math.round(vdot * 10) / 10,
    vmaKmh: Math.round(vmaDepuisVdot(vdot) * 10) / 10,
    note,
  }
}

/**
 * Niveau à utiliser : l'évaluation la plus récente. Daniels (2014) règle les
 * allures sur la dernière performance, pas sur le record personnel.
 */
export function evaluationCourante(evaluations: Evaluation[]): Evaluation | null {
  if (evaluations.length === 0) return null
  return [...evaluations].sort((a, b) => b.date.localeCompare(a.date))[0]
}
