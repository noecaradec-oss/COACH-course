// Suivi : bilan par semaine, alertes et lien entre le réalisé et le prévu.

import {
  type CategorieIntensite,
  SEUIL_MONOTONIE,
  chargeSeance,
  hausseTropRapide,
  monotonie,
  repartirIntensites,
  tropPeuDeFacile,
  type Repartition,
} from './charge'
import { type DateIso, ajouterJours, jourSemaine, joursEntre, lundiDe } from './dates'
import type { Activite, Plan, SeancePrevue } from './modele'

export function toutesLesSeances(plan: Plan | null): SeancePrevue[] {
  return plan ? plan.semaines.flatMap((s) => s.seances) : []
}

/** Séance du plan prévue ce jour-là et pas encore réalisée. */
export function seanceDuJour(plan: Plan | null, date: DateIso, activites: Activite[]): SeancePrevue | null {
  const faites = new Set(activites.map((a) => a.seanceId))
  return toutesLesSeances(plan).find((s) => s.date === date && !faites.has(s.id)) ?? null
}

/**
 * Catégorie d'intensité d'une activité : celle de la séance prévue si elle
 * est rattachée au plan, sinon d'après le ressenti. Seiler & Kjerland (2006)
 * classent les séances par RPE : 4 ou moins = facile, 5–6 = seuil, 7 et
 * plus = intense.
 */
export function categorieActivite(activite: Activite, seances: Map<string, SeancePrevue>): CategorieIntensite | null {
  const prevue = activite.seanceId ? seances.get(activite.seanceId) : undefined
  if (prevue) return prevue.categorie
  if (activite.rpe === undefined) return null
  if (activite.rpe <= 4) return 'facile'
  if (activite.rpe <= 6) return 'seuil'
  return 'intense'
}

export interface BilanSemaine {
  debut: DateIso
  km: number
  dureeMin: number
  nbSeances: number
  /** Somme des charges RPE × durée (Foster, 2001) ; null si aucun ressenti saisi. */
  charge: number | null
  monotonie: number | null
  kmPrevus: number | null
}

/** Bilans des `nb` dernières semaines, de la plus ancienne à la semaine en cours. */
export function bilansHebdo(activites: Activite[], plan: Plan | null, jour: DateIso, nb: number): BilanSemaine[] {
  const lundiCourant = lundiDe(jour)
  const bilans: BilanSemaine[] = []
  for (let i = nb - 1; i >= 0; i--) {
    const debut = ajouterJours(lundiCourant, -7 * i)
    const semaine = activites.filter((a) => lundiDe(a.date) === debut)
    const chargesJour = [0, 0, 0, 0, 0, 0, 0]
    let avecRpe = 0
    for (const a of semaine) {
      if (a.rpe === undefined) continue
      avecRpe++
      chargesJour[jourSemaine(a.date)] += chargeSeance(a.rpe, a.dureeS / 60)
    }
    const prevue = plan?.semaines.find((s) => s.debut === debut)
    bilans.push({
      debut,
      km: Math.round(semaine.reduce((s, a) => s + a.distanceM, 0) / 100) / 10,
      dureeMin: Math.round(semaine.reduce((s, a) => s + a.dureeS, 0) / 60),
      nbSeances: semaine.length,
      charge: avecRpe > 0 ? Math.round(chargesJour.reduce((s, c) => s + c, 0)) : null,
      // La monotonie n'a de sens que sur une semaine terminée et entièrement notée.
      monotonie: i > 0 && avecRpe === semaine.length && semaine.length > 0 ? monotonie(chargesJour) : null,
      kmPrevus: prevue ? prevue.volumeKm : null,
    })
  }
  return bilans
}

/** Répartition des intensités sur les 28 derniers jours (Seiler & Kjerland, 2006). */
export function repartitionRecente(activites: Activite[], plan: Plan | null, jour: DateIso): Repartition {
  const seances = new Map(toutesLesSeances(plan).map((s) => [s.id, s]))
  const categories: CategorieIntensite[] = []
  for (const a of activites) {
    const ecart = joursEntre(a.date, jour)
    if (ecart < 0 || ecart >= 28) continue
    const c = categorieActivite(a, seances)
    if (c) categories.push(c)
  }
  return repartirIntensites(categories)
}

export interface Alerte {
  titre: string
  detail: string
  source: string
}

/**
 * Signaux à surveiller. Chaque alerte rappelle sa source : ce sont des
 * repères issus d'études de groupe, pas des diagnostics individuels.
 */
export function calculerAlertes(activites: Activite[], plan: Plan | null, jour: DateIso): Alerte[] {
  const alertes: Alerte[] = []
  const bilans = bilansHebdo(activites, plan, jour, 3)
  const [avantDerniere, derniere, courante] = bilans

  // Hausse du kilométrage : semaine en cours ou dernière semaine terminée.
  const hausse = hausseTropRapide(derniere.km, courante.km)
    ? [derniere.km, courante.km]
    : hausseTropRapide(avantDerniere.km, derniere.km)
      ? [avantDerniere.km, derniere.km]
      : null
  if (hausse) {
    alertes.push({
      titre: 'Kilométrage en forte hausse',
      detail: `Vous êtes passé de ${hausse[0]} à ${hausse[1]} km d’une semaine à l’autre (+${Math.round((hausse[1] / hausse[0] - 1) * 100)} %). Au-delà de +30 %, le risque de blessure augmente chez les débutants. Stabilisez une semaine.`,
      source: 'Nielsen et al., 2014',
    })
  }

  if (derniere.monotonie !== null && derniere.monotonie > SEUIL_MONOTONIE) {
    alertes.push({
      titre: 'Semaine trop uniforme',
      detail: `Monotonie de ${derniere.monotonie.toFixed(1)} la semaine dernière : vos journées se ressemblent trop. Alternez vraiment jours faciles, jours durs et repos.`,
      source: 'Foster, 1998',
    })
  }

  const repartition = repartitionRecente(activites, plan, jour)
  if (tropPeuDeFacile(repartition)) {
    alertes.push({
      titre: 'Trop peu de séances faciles',
      detail: `Sur 4 semaines, ${repartition.facile} séances faciles sur ${repartition.total}. Les coureurs d’endurance qui progressent en font environ 80 %.`,
      source: 'Seiler & Kjerland, 2006',
    })
  }

  // Séances prévues faciles mais ressenties dures (RPE 6 ou plus), deux fois en
  // 14 jours : allures trop rapides ou fatigue. Seuils choisis par l'entraîneur,
  // à partir de l'échelle de ressenti de Foster (2001).
  const seances = new Map(toutesLesSeances(plan).map((s) => [s.id, s]))
  const facilesDures = activites.filter((a) => {
    const ecart = joursEntre(a.date, jour)
    const prevue = a.seanceId ? seances.get(a.seanceId) : undefined
    return ecart >= 0 && ecart < 14 && prevue?.categorie === 'facile' && (a.rpe ?? 0) >= 6
  })
  if (facilesDures.length >= 2) {
    alertes.push({
      titre: 'Vos footings vous coûtent trop',
      detail: 'Deux séances faciles ressenties comme dures en deux semaines. Ralentissez franchement en endurance, vérifiez votre sommeil, et refaites une évaluation si vos allures datent.',
      source: 'Repère d’entraîneur, d’après l’échelle de Foster, 2001',
    })
  }
  return alertes
}

/**
 * Volume de départ pour réajuster un plan : moyenne des 3 dernières semaines
 * terminées où le coureur a couru. Choix d'entraîneur : on repart de ce qui
 * a réellement été fait, pas de ce qui était prévu. Null sans historique.
 */
export function volumeRecentKm(activites: Activite[], jour: DateIso): number | null {
  const terminees = bilansHebdo(activites, null, jour, 4).slice(0, 3).filter((b) => b.km > 0)
  if (terminees.length === 0) return null
  return Math.round(terminees.reduce((s, b) => s + b.km, 0) / terminees.length)
}
