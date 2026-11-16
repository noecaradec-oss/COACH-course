// Tableau de bord : comparaison automatique du prévu et du réalisé, et
// séries de données des graphiques.

import { chargeSeance } from './charge'
import { type DateIso, ajouterJours, lundiDe } from './dates'
import type { Activite, Evaluation, Plan, SeancePrevue } from './modele'
import { toutesLesSeances } from './suivi'

export type Statut = 'faite' | 'manquee' | 'horsPlan'

/** Une ligne par séance : ce qui était prévu en regard de ce qui a été fait. */
export interface Comparaison {
  date: DateIso
  statut: Statut
  prevue: SeancePrevue | null
  activite: Activite | null
  /** Réalisé moins prévu ; null s'il manque l'un des deux. */
  ecartKm: number | null
  ecartMin: number | null
  /** Ressenti réel moins ressenti visé (positif = plus dur que prévu). */
  ecartRpe: number | null
  /** Charge de la séance : ressenti × minutes (Foster et al., 2001). */
  charge: number | null
}

const arrondi = (n: number) => Math.round(n * 10) / 10

/**
 * Met en regard chaque séance prévue jusqu'à hier (et celles d'aujourd'hui
 * déjà faites) avec l'activité qui y répond. Les sorties sans séance prévue
 * apparaissent « hors plan ». La course elle-même est comparée comme une séance.
 */
export function comparerPrevuRealise(plan: Plan | null, activites: Activite[], jour: DateIso): Comparaison[] {
  const parSeance = new Map(activites.filter((a) => a.seanceId).map((a) => [a.seanceId!, a]))
  const prevues = toutesLesSeances(plan)
  const idsPrevus = new Set(prevues.map((s) => s.id))
  const lignes: Comparaison[] = []

  for (const prevue of prevues) {
    const activite = parSeance.get(prevue.id) ?? null
    // Une séance à venir, ou celle du jour pas encore faite, n'est pas « manquée ».
    if (!activite && prevue.date >= jour) continue
    lignes.push({
      date: activite?.date ?? prevue.date,
      statut: activite ? 'faite' : 'manquee',
      prevue,
      activite,
      ecartKm: activite ? arrondi(activite.distanceM / 1000 - prevue.distanceKm) : null,
      ecartMin: activite ? Math.round(activite.dureeS / 60 - prevue.dureeMin) : null,
      ecartRpe: activite?.rpe !== undefined ? activite.rpe - prevue.rpeVise : null,
      charge: activite?.rpe !== undefined ? Math.round(chargeSeance(activite.rpe, activite.dureeS / 60)) : null,
    })
  }
  for (const activite of activites) {
    // Hors plan : pas de séance rattachée, ou rattachée à un plan remplacé depuis.
    if (activite.seanceId && idsPrevus.has(activite.seanceId)) continue
    lignes.push({
      date: activite.date,
      statut: 'horsPlan',
      prevue: null,
      activite,
      ecartKm: null,
      ecartMin: null,
      ecartRpe: null,
      charge: activite.rpe !== undefined ? Math.round(chargeSeance(activite.rpe, activite.dureeS / 60)) : null,
    })
  }
  return lignes.sort((a, b) => a.date.localeCompare(b.date))
}

export interface Regularite {
  debut: DateIso
  prevues: number
  faites: number
  /** Part des séances prévues réalisées, de 0 à 1 ; null si rien n'était prévu. */
  taux: number | null
}

/** Séances faites sur séances prévues, pour chacune des `nb` dernières semaines. */
export function regulariteHebdo(plan: Plan | null, activites: Activite[], jour: DateIso, nb: number): Regularite[] {
  const faites = new Set(activites.map((a) => a.seanceId))
  const resultat: Regularite[] = []
  for (let i = nb - 1; i >= 0; i--) {
    const debut = ajouterJours(lundiDe(jour), -7 * i)
    const semaine = plan?.semaines.find((s) => s.debut === debut)
    // Dans la semaine en cours, seules les séances déjà échues comptent.
    const prevues = (semaine?.seances ?? []).filter((s) => s.date < jour || faites.has(s.id))
    const nbFaites = prevues.filter((s) => faites.has(s.id)).length
    resultat.push({ debut, prevues: prevues.length, faites: nbFaites, taux: prevues.length > 0 ? nbFaites / prevues.length : null })
  }
  return resultat
}

export interface PointRpe {
  date: DateIso
  titre: string
  rpeVise: number
  rpe: number
}

/** Ressenti prévu et réalisé des `nb` dernières séances du plan qui ont été notées. */
export function serieRpe(plan: Plan | null, activites: Activite[], nb: number): PointRpe[] {
  const prevues = new Map(toutesLesSeances(plan).map((s) => [s.id, s]))
  return activites
    .filter((a) => a.rpe !== undefined && a.seanceId && prevues.has(a.seanceId))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-nb)
    .map((a) => {
      const prevue = prevues.get(a.seanceId!)!
      return { date: a.date, titre: prevue.titre, rpeVise: prevue.rpeVise, rpe: a.rpe! }
    })
}

/** Évaluations dans l'ordre chronologique : l'évolution du niveau. */
export function historiqueNiveau(evaluations: Evaluation[]): Evaluation[] {
  return [...evaluations].sort((a, b) => a.date.localeCompare(b.date))
}

export interface Synthese {
  seancesPrevues: number
  seancesFaites: number
  seancesManquees: number
  seancesHorsPlan: number
  kmPrevus: number
  kmRealises: number
  /** Moyenne des écarts de ressenti sur les séances notées ; null s'il n'y en a pas. */
  ecartRpeMoyen: number | null
}

/** Chiffres clés du prévu / réalisé sur une liste de comparaisons. */
export function synthetiser(lignes: Comparaison[]): Synthese {
  const duPlan = lignes.filter((l) => l.prevue)
  const ecarts = lignes.map((l) => l.ecartRpe).filter((e): e is number => e !== null)
  return {
    seancesPrevues: duPlan.length,
    seancesFaites: duPlan.filter((l) => l.statut === 'faite').length,
    seancesManquees: duPlan.filter((l) => l.statut === 'manquee').length,
    seancesHorsPlan: lignes.filter((l) => l.statut === 'horsPlan').length,
    kmPrevus: arrondi(duPlan.reduce((s, l) => s + l.prevue!.distanceKm, 0)),
    kmRealises: arrondi(lignes.reduce((s, l) => s + (l.activite ? l.activite.distanceM / 1000 : 0), 0)),
    ecartRpeMoyen: ecarts.length > 0 ? arrondi(ecarts.reduce((s, e) => s + e, 0) / ecarts.length) : null,
  }
}
