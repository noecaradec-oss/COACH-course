// Motivation : ressenti, badges, séries et paliers.
//
// Tout est recalculé à partir du journal ; rien n'est stocké.
// Parti pris d'entraîneur : on récompense la régularité, l'écoute de soi et
// le fait de courir lentement quand il le faut, jamais le fait de forcer.
// Les séries se comptent en semaines : un jour de repos ne les casse pas.

import { type DateIso, ajouterJours, lundiDe } from './dates'
import type { Activite, Plan } from './modele'
import { toutesLesSeances } from './suivi'

export interface NiveauRpe {
  valeur: number
  nom: string
  /** Repère concret : le test de la parole. */
  repere: string
}

/**
 * Échelle de ressenti de la séance, de 1 à 10. Libellés adaptés de l'échelle
 * de Foster et al. (2001) ; les repères de parole viennent du « talk test »
 * (Foster et al., 2004 ; Persinger et al., 2004), cités de mémoire.
 */
export const ECHELLE_RPE: NiveauRpe[] = [
  { valeur: 1, nom: 'Très, très facile', repere: 'Comme une marche tranquille.' },
  { valeur: 2, nom: 'Facile', repere: 'Vous pourriez chanter.' },
  { valeur: 3, nom: 'Modéré', repere: 'Vous parlez sans y penser.' },
  { valeur: 4, nom: 'Un peu dur', repere: 'Vous parlez en phrases complètes.' },
  { valeur: 5, nom: 'Dur', repere: 'Les phrases deviennent courtes.' },
  { valeur: 6, nom: 'Dur, soutenu', repere: 'Quelques mots à la fois.' },
  { valeur: 7, nom: 'Très dur', repere: 'Un mot ou deux, pas plus.' },
  { valeur: 8, nom: 'Très dur, limite', repere: 'Parler n’est plus possible.' },
  { valeur: 9, nom: 'Extrêmement dur', repere: 'Vous ne tiendriez pas une minute de plus.' },
  { valeur: 10, nom: 'Maximal', repere: 'Tout donné, impossible de continuer.' },
]

// ───────────────────────── Séries ─────────────────────────

/** Une semaine compte dans la série dès 2 séances (1 si le plan n'en prévoit qu'une). */
function semaineValidee(activites: Activite[], plan: Plan | null, lundi: DateIso): boolean {
  const faites = activites.filter((a) => lundiDe(a.date) === lundi).length
  const prevues = plan?.semaines.find((s) => s.debut === lundi)?.seances.length
  return faites >= (prevues === 1 ? 1 : 2)
}

/**
 * Nombre de semaines consécutives validées. La semaine en cours compte si
 * elle l'est déjà, et ne casse pas la série tant qu'elle n'est pas finie.
 */
export function serieEnCours(activites: Activite[], plan: Plan | null, jour: DateIso): number {
  let lundi = lundiDe(jour)
  let serie = semaineValidee(activites, plan, lundi) ? 1 : 0
  for (;;) {
    lundi = ajouterJours(lundi, -7)
    if (!semaineValidee(activites, plan, lundi)) return serie
    serie++
  }
}

/** Plus longue série de semaines validées de tout le journal. */
export function meilleureSerie(activites: Activite[], plan: Plan | null): number {
  if (activites.length === 0) return 0
  const dates = activites.map((a) => a.date).sort()
  let meilleure = 0
  let serie = 0
  for (let lundi = lundiDe(dates[0]); lundi <= lundiDe(dates[dates.length - 1]); lundi = ajouterJours(lundi, 7)) {
    serie = semaineValidee(activites, plan, lundi) ? serie + 1 : 0
    meilleure = Math.max(meilleure, serie)
  }
  return meilleure
}

// ───────────────────────── Paliers ─────────────────────────

// Paliers en kilomètres cumulés. Simple repère de chemin parcouru, sans
// valeur physiologique.
const PALIERS: { km: number; nom: string }[] = [
  { km: 0, nom: 'Sur la ligne de départ' },
  { km: 25, nom: 'Premières foulées' },
  { km: 75, nom: 'En rythme' },
  { km: 150, nom: 'Souffle long' },
  { km: 300, nom: 'Régularité' },
  { km: 500, nom: 'Endurance' },
  { km: 800, nom: 'Fond solide' },
  { km: 1200, nom: 'Grande forme' },
  { km: 1800, nom: 'Coureur de fond' },
  { km: 2500, nom: 'Infatigable' },
]

export interface Palier {
  numero: number
  nom: string
  km: number
  /** Kilomètres du palier suivant, ou null au dernier. */
  prochainKm: number | null
  /** Avancement vers le palier suivant, de 0 à 1. */
  avancement: number
}

export function palierActuel(activites: Activite[]): Palier {
  const km = activites.reduce((s, a) => s + a.distanceM, 0) / 1000
  let rang = 0
  for (let i = 0; i < PALIERS.length; i++) if (km >= PALIERS[i].km) rang = i
  const suivant = PALIERS[rang + 1]
  return {
    numero: rang + 1,
    nom: PALIERS[rang].nom,
    km: Math.round(km),
    prochainKm: suivant?.km ?? null,
    avancement: suivant ? (km - PALIERS[rang].km) / (suivant.km - PALIERS[rang].km) : 1,
  }
}

// ───────────────────────── Badges ─────────────────────────

export interface Badge {
  id: string
  nom: string
  description: string
  obtenu: boolean
  /** Avancement : valeur actuelle et valeur à atteindre. */
  actuel: number
  cible: number
}

function badge(id: string, nom: string, description: string, actuel: number, cible: number): Badge {
  return { id, nom, description, obtenu: actuel >= cible, actuel: Math.min(Math.floor(actuel), cible), cible }
}

/** Nombre de semaines du plan dont toutes les séances prévues ont été faites. */
function semainesCompletes(activites: Activite[], plan: Plan | null, jour: DateIso): number {
  if (!plan) return 0
  const faites = new Set(activites.map((a) => a.seanceId))
  return plan.semaines.filter((s) => {
    const prevues = s.seances.filter((x) => x.type !== 'course')
    return ajouterJours(s.debut, 6) < jour && prevues.length > 0 && prevues.every((x) => faites.has(x.id))
  }).length
}

/** Les 10 badges de départ. */
export function calculerBadges(activites: Activite[], plan: Plan | null, jour: DateIso): Badge[] {
  const km = activites.reduce((s, a) => s + a.distanceM, 0) / 1000
  const seances = new Map(toutesLesSeances(plan).map((s) => [s.id, s]))
  // Footing prévu facile et réellement ressenti facile (4 ou moins) : savoir courir lentement.
  const footingsSages = activites.filter((a) => a.seanceId && seances.get(a.seanceId)?.categorie === 'facile' && a.rpe !== undefined && a.rpe <= 4).length
  const qualite = activites.filter((a) => a.seanceId && seances.get(a.seanceId)?.categorie !== 'facile' && seances.get(a.seanceId)?.type !== 'course').length
  const plusLongueMin = Math.max(0, ...activites.map((a) => a.dureeS / 60))
  return [
    badge('premier-pas', 'Premier pas', 'Enregistrer une première séance.', activites.length, 1),
    badge('dix-seances', 'Dix au compteur', 'Enregistrer 10 séances.', activites.length, 10),
    badge('serie-3', 'Trois semaines d’affilée', '3 semaines de suite avec au moins 2 séances.', meilleureSerie(activites, plan), 3),
    badge('serie-8', 'Deux mois de régularité', '8 semaines de suite avec au moins 2 séances.', meilleureSerie(activites, plan), 8),
    badge('semaine-pleine', 'Semaine pleine', 'Faire toutes les séances prévues d’une semaine.', semainesCompletes(activites, plan, jour), 1),
    badge('a-l-ecoute', 'À l’écoute', 'Noter son ressenti sur 10 séances.', activites.filter((a) => a.rpe !== undefined).length, 10),
    badge('sagesse', 'Sagesse', '5 footings faciles vraiment courus facile (ressenti de 4 ou moins).', footingsSages, 5),
    badge('qualite', 'Du rythme', 'Terminer 5 séances de qualité.', qualite, 5),
    badge('longue', 'Une heure et demie', 'Courir 90 minutes d’une traite.', plusLongueMin, 90),
    badge('cent-km', 'Cent kilomètres', 'Cumuler 100 km.', km, 100),
  ]
}

/** Badges obtenus après une séance et qui ne l'étaient pas avant. */
export function nouveauxBadges(avant: Badge[], apres: Badge[]): Badge[] {
  const dejaObtenus = new Set(avant.filter((b) => b.obtenu).map((b) => b.id))
  return apres.filter((b) => b.obtenu && !dejaObtenus.has(b.id))
}
