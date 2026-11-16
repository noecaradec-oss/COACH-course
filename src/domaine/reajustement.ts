// Réajustement du plan selon ce qui a réellement été fait : séances manquées
// et ressenti (RPE) comparé au ressenti prévu.
//
// Ce que ce module n'utilise pas, volontairement : le ratio de charge aiguë /
// chronique (ACWR, Gabbett, 2016). Sa capacité à prédire les blessures est
// contestée (Lolli et al., 2019 ; Impellizzeri et al., 2020) : le ratio
// couple artificiellement ses deux termes et les seuils publiés ne se
// retrouvent pas d'une étude à l'autre. On s'en tient à des signaux simples,
// lisibles par le coureur, et on lui laisse la décision.

import { type DateIso, joursEntre, lundiDe } from './dates'
import type { Activite, Objectif, Plan, Profil, SeancePrevue } from './modele'
import { genererPlan } from './plan'
import { volumeRecentKm } from './suivi'

export interface Diagnostic {
  /** Multiplicateur appliqué au volume de reprise (1 = inchangé). */
  facteurVolume: number
  /** Repartir par une semaine allégée. */
  semaineAllegee: boolean
  /** Pourquoi le plan devrait changer. */
  raisons: string[]
  /** Remarques qui ne modifient pas le plan. */
  conseils: string[]
  necessaire: boolean
}

// Fenêtre d'observation : les 14 derniers jours. Choix d'entraîneur : assez
// long pour lisser une mauvaise journée, assez court pour réagir.
const FENETRE_JOURS = 14

// Reprise après une coupure. Les pertes deviennent mesurables après environ
// deux semaines d'arrêt (Mujika & Padilla, 2000, Sports Med, « Detraining »).
// Les coefficients de reprise (70 %, 85 %, 90 %) sont un choix d'entraîneur.
const FACTEUR_DEUX_SEMAINES_BLANCHES = 0.7
const FACTEUR_SEMAINE_BLANCHE = 0.85
const FACTEUR_MOITIE_MANQUEE = 0.9

// Écart de ressenti jugé significatif : 2 points au-dessus du ressenti visé,
// sur l'échelle de Foster et al. (2001), deux fois dans la fenêtre. Seuils
// d'entraîneur : un point d'écart tient du bruit, deux séances écartent
// l'accident. Réponse : une semaine allégée, le remède classique à la
// fatigue accumulée (modèle forme – fatigue de Banister et al., 1975).
const ECART_RPE = 2
const NB_SEANCES_DURES = 2
const FACTEUR_FATIGUE = 0.85
const NB_SEANCES_FACILES = 3

interface Suivi {
  prevue: SeancePrevue
  activite: Activite | undefined
}

/** Séances prévues dans les `jours` derniers jours (hors aujourd'hui), avec l'activité qui y répond. */
function seancesRecentes(plan: Plan, activites: Activite[], jour: DateIso, jours: number): Suivi[] {
  return plan.semaines
    .flatMap((s) => s.seances)
    .filter((s) => s.type !== 'course' && joursEntre(s.date, jour) >= 1 && joursEntre(s.date, jour) <= jours)
    .map((prevue) => ({
      prevue,
      // Une sortie le même jour compte, même si elle n'a pas été rattachée à la séance.
      activite: activites.find((a) => a.seanceId === prevue.id) ?? activites.find((a) => a.date === prevue.date && !a.seanceId),
    }))
}

export function diagnostiquer(plan: Plan, activites: Activite[], jour: DateIso): Diagnostic {
  const raisons: string[] = []
  const conseils: string[] = []
  let facteurVolume = 1
  let semaineAllegee = false

  const quinzaine = seancesRecentes(plan, activites, jour, FENETRE_JOURS)
  const semaine = quinzaine.filter((s) => joursEntre(s.prevue.date, jour) <= 7)
  const manquees = (liste: Suivi[]) => liste.filter((s) => !s.activite).length

  // ── Séances manquées : on ne rattrape jamais, on repart plus bas. ──
  if (quinzaine.length >= 3 && manquees(quinzaine) === quinzaine.length) {
    facteurVolume = FACTEUR_DEUX_SEMAINES_BLANCHES
    raisons.push('Aucune séance depuis deux semaines : le plan repart à 70 % du volume prévu, puis remonte progressivement.')
  } else if (semaine.length >= 2 && manquees(semaine) === semaine.length) {
    facteurVolume = FACTEUR_SEMAINE_BLANCHE
    raisons.push('Aucune séance depuis une semaine : le plan repart à 85 % du volume prévu.')
  } else if (quinzaine.length >= 4 && manquees(quinzaine) / quinzaine.length >= 0.5) {
    facteurVolume = FACTEUR_MOITIE_MANQUEE
    raisons.push(`${manquees(quinzaine)} séances manquées sur ${quinzaine.length} en deux semaines : volume réduit de 10 %. Les séances perdues ne se rattrapent pas.`)
  }

  // ── Ressenti réel comparé au ressenti prévu. ──
  const notees = quinzaine.filter((s) => s.activite?.rpe !== undefined)
  const dures = notees.filter((s) => s.activite!.rpe! - s.prevue.rpeVise >= ECART_RPE)
  const faciles = notees.filter((s) => s.activite!.rpe! - s.prevue.rpeVise <= -ECART_RPE)
  if (dures.length >= NB_SEANCES_DURES) {
    facteurVolume *= FACTEUR_FATIGUE
    semaineAllegee = true
    raisons.push(`${dures.length} séances ressenties nettement plus dures que prévu : le plan repart par une semaine allégée, avec un volume réduit de 15 %.`)
    conseils.push('Si la fatigue dure, vérifiez le sommeil, l’alimentation et le stress ; en cas de douleur, consultez.')
  } else if (faciles.length >= NB_SEANCES_FACILES && faciles.some((s) => s.prevue.categorie !== 'facile')) {
    // Daniels (2014) : on ne relève pas ses allures sur une impression, mais sur une nouvelle performance.
    conseils.push('Vos séances vous paraissent plus faciles que prévu : refaites une évaluation (test de 6 minutes ou course) plutôt que d’accélérer de vous-même.')
  }

  return { facteurVolume: Math.round(facteurVolume * 100) / 100, semaineAllegee, raisons, conseils, necessaire: facteurVolume < 1 || semaineAllegee }
}

export interface EntreeReajustement {
  /** Identifiant du nouveau plan. */
  id: string
  plan: Plan
  profil: Profil
  objectif: Objectif
  vdot: number | null
  activites: Activite[]
  jour: DateIso
}

/**
 * Refait le plan à partir d'aujourd'hui. Les semaines passées sont
 * conservées telles quelles, pour que le prévu reste comparable au réalisé.
 *
 * Volume de reprise : celui de la semaine en cours dans l'ancien plan, sans
 * dépasser de plus de 10 % ce qui a réellement été couru ces dernières
 * semaines (même repère que la progression du plan), puis multiplié par le
 * facteur du diagnostic.
 */
export function reajuster(e: EntreeReajustement): Plan {
  const diagnostic = diagnostiquer(e.plan, e.activites, e.jour)
  const lundi = lundiDe(e.jour)
  const passees = e.plan.semaines.filter((s) => s.debut < lundi)
  const courante = e.plan.semaines.find((s) => s.debut === lundi)

  // Le volume prévu sert de référence ; s'il manque (plan terminé), on prend le profil.
  const prevu = courante?.volumeKm ?? passees.at(-1)?.volumeKm ?? e.profil.volumeHebdoKm
  const reel = volumeRecentKm(e.activites, e.jour)
  const volumeDepartKm = Math.max(8, Math.round(Math.min(prevu, reel !== null ? reel * 1.1 : prevu) * diagnostic.facteurVolume))

  const nouveau = genererPlan({
    id: e.id,
    profil: e.profil,
    objectif: e.objectif,
    vdot: e.vdot,
    dateDepart: e.jour,
    volumeDepartKm,
    premiereSemaineAllegee: diagnostic.semaineAllegee,
  })

  // Dans la semaine en cours, on garde les jours déjà passés de l'ancien plan.
  const dejaPassees = courante ? courante.seances.filter((s) => s.date < e.jour) : []
  const semaines = nouveau.semaines.map((s, i) => {
    const seances = i === 0 ? [...dejaPassees, ...s.seances] : s.seances
    return { ...s, numero: passees.length + i + 1, seances, volumeKm: Math.round(seances.reduce((t, x) => t + x.distanceKm, 0) * 10) / 10 }
  })

  return {
    ...nouveau,
    semaines: [...passees, ...semaines],
    ajustements: diagnostic.raisons.length > 0 ? diagnostic.raisons : ['Plan recalculé à votre demande, à partir du volume réellement couru.'],
  }
}
