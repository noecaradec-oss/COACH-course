// Évaluation du niveau : d'une course ou d'un test de terrain vers VDOT et VMA.

import type { DateIso } from './dates'
import type { Evaluation, Fiabilite, TypeEvaluation } from './modele'
import { VERSION_DONNEES } from './modele'
import { DUREE_VMA_MIN, calculerVdot, vmaDepuisVdot, vo2DepuisVitesse } from './vdot'

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
  /**
   * Faute de chrono : allure habituelle de footing, en secondes par km.
   * On suppose que le footing se court au milieu de la fourchette
   * d'endurance de Daniels (2014), soit 66,5 % du VDOT. Estimation
   * d'entraîneur, grossière : beaucoup de coureurs font leurs footings trop
   * vite, ce qui surestime le niveau. À remplacer dès qu'un chrono existe.
   */
  | { type: 'footing'; allureSParKm: number }

const FRACTION_FOOTING = 0.665

/** VDOT estimé à partir de l'allure de footing (voir SaisieEvaluation). */
export function vdotDepuisFooting(allureSParKm: number): number {
  return vo2DepuisVitesse(60000 / allureSParKm) / FRACTION_FOOTING
}

export function evaluer(saisie: SaisieEvaluation, date: DateIso, id: string, note = '', fiabilite?: Fiabilite): Evaluation {
  let distanceM: number
  let dureeS: number
  if (saisie.type === 'footing') {
    // Pas de performance : on enregistre 30 min à l'allure de footing, pour mémoire.
    const vdotEstime = vdotDepuisFooting(saisie.allureSParKm)
    return {
      id,
      version: VERSION_DONNEES,
      date,
      type: 'footing',
      distanceM: Math.round((1800 / saisie.allureSParKm) * 1000),
      dureeS: 1800,
      vdot: Math.round(vdotEstime * 10) / 10,
      vmaKmh: Math.round(vmaDepuisVdot(vdotEstime) * 10) / 10,
      fiabilite: 'faible',
      note,
    }
  }
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
    fiabilite: fiabilite ?? 'bonne',
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
