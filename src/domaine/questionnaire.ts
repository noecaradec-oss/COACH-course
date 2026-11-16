// Premier entretien : les questions, et le profil qui en sort.
//
// Le questionnaire se remplit seul. Sortie : niveau, VDOT estimé, volume de
// départ, jours possibles, et les conseils de prudence.

import { type DateIso, ajouterJours } from './dates'
import { evaluer } from './evaluation'
import {
  type Evaluation,
  type Fiabilite,
  type JourSemaine,
  type Objectif,
  type Profil,
  type Sexe,
  type TypeObjectif,
  VERSION_DONNEES,
} from './modele'
import { determinerNiveau } from './niveau'
import { placerJoursDurs } from './placement'
import type { Niveau } from './seances'

export type Anciennete = 'moins3' | '3a6' | '6a12' | 'plus12'

export interface Reponses {
  prenom: string
  anneeNaissance: number | null
  sexe: Sexe | ''
  typeObjectif: TypeObjectif | ''
  distanceM: number | null
  deniveleM: number | null
  dateCourse: DateIso | ''
  tempsViseS: number | null
  aChrono: boolean | null
  chronoDistanceM: number | null
  chronoDureeS: number | null
  chronoAnciennete: Anciennete | ''
  allureFootingS: number | null
  volumeKm: number | null
  anneesPratique: number | null
  plusLongueSortieKm: number | null
  blessureRecente: boolean | null
  blessureDetail: string
  alerteSante: boolean | null
  jours: JourSemaine[]
  sortieLongueJour: JourSemaine | null
  dureeMaxSemaineMin: number | null
  materiel: ('gps' | 'cardio')[]
  terrains: ('piste' | 'cotes' | 'chemins')[]
  fcMax: number | null
  fcRepos: number | null
}

export function reponsesVides(): Reponses {
  return {
    prenom: '',
    anneeNaissance: null,
    sexe: '',
    typeObjectif: '',
    distanceM: null,
    deniveleM: null,
    dateCourse: '',
    tempsViseS: null,
    aChrono: null,
    chronoDistanceM: null,
    chronoDureeS: null,
    chronoAnciennete: '',
    allureFootingS: null,
    volumeKm: null,
    anneesPratique: null,
    plusLongueSortieKm: null,
    blessureRecente: null,
    blessureDetail: '',
    alerteSante: null,
    jours: [],
    sortieLongueJour: null,
    dureeMaxSemaineMin: null,
    materiel: [],
    terrains: [],
    fcMax: null,
    fcRepos: null,
  }
}

export type Theme = 'Vous' | 'Objectif' | 'Chronos' | 'Volume et historique' | 'Santé' | 'Disponibilités' | 'Matériel et préférences'

export interface Option {
  /** Valeur enregistrée dans les réponses. */
  valeur: string | number | boolean
  nom: string
  detail?: string
}

export type Saisie =
  | { genre: 'texte' }
  /** `facteur` : multiplicateur entre la saisie et la valeur enregistrée (km saisis, mètres enregistrés). */
  | { genre: 'nombre'; unite: string; min: number; max: number; exemple: string; facteur?: number }
  | { genre: 'duree'; exemple: string }
  | { genre: 'date' }
  | { genre: 'choix'; options: Option[] }
  | { genre: 'multi'; options: Option[] }
  | { genre: 'jours' }
  | { genre: 'jour' }

export interface Question {
  champ: keyof Reponses
  theme: Theme
  titre: string
  aide?: string
  saisie: Saisie
  facultative?: boolean
  /** Question posée seulement si la condition est vraie. */
  si?: (r: Reponses) => boolean
  /** Temps de réponse estimé, en secondes (estimation d'entraîneur, non mesurée). */
  secondes: number
}

const OUI_NON: Option[] = [
  { valeur: true, nom: 'Oui' },
  { valeur: false, nom: 'Non' },
]

const aCourse = (r: Reponses) => r.typeObjectif !== '' && r.typeObjectif !== 'premier5k'

export const QUESTIONS: Question[] = [
  { champ: 'prenom', theme: 'Vous', titre: 'Comment vous appelez-vous ?', saisie: { genre: 'texte' }, facultative: true, secondes: 6 },
  {
    champ: 'anneeNaissance',
    theme: 'Vous',
    titre: 'Votre année de naissance ?',
    aide: 'Elle sert à estimer votre fréquence cardiaque maximale.',
    saisie: { genre: 'nombre', unite: '', min: 1925, max: 2018, exemple: '1990' },
    secondes: 8,
  },
  {
    champ: 'sexe',
    theme: 'Vous',
    titre: 'Vous êtes…',
    aide: 'Facultatif. Sert au calcul de la charge par la fréquence cardiaque.',
    saisie: {
      genre: 'choix',
      options: [
        { valeur: 'femme', nom: 'Une femme' },
        { valeur: 'homme', nom: 'Un homme' },
        { valeur: '', nom: 'Je préfère ne pas répondre' },
      ],
    },
    facultative: true,
    secondes: 4,
  },
  {
    champ: 'typeObjectif',
    theme: 'Objectif',
    titre: 'Quel est votre objectif ?',
    saisie: {
      genre: 'choix',
      options: [
        { valeur: 'premier5k', nom: 'Courir mon premier 5 km', detail: 'Je débute ou je reprends de zéro' },
        { valeur: 'route', nom: 'Une course sur route', detail: '5 km, 10 km, semi, marathon' },
        { valeur: 'piste', nom: 'Une course sur piste', detail: '1500 m à 10 000 m' },
        { valeur: 'cross', nom: 'Un cross' },
        { valeur: 'trail', nom: 'Un trail' },
      ],
    },
    secondes: 8,
  },
  {
    champ: 'distanceM',
    theme: 'Objectif',
    titre: 'Quelle distance ?',
    aide: 'En kilomètres. Exemples : 1,5 · 5 · 10 · 21,1 · 42,2.',
    saisie: { genre: 'nombre', unite: 'km', min: 0.8, max: 180, exemple: '10', facteur: 1000 },
    si: aCourse,
    secondes: 8,
  },
  {
    champ: 'deniveleM',
    theme: 'Objectif',
    titre: 'Quel dénivelé positif ?',
    aide: 'En mètres, sur l’ensemble du parcours.',
    saisie: { genre: 'nombre', unite: 'm', min: 0, max: 12000, exemple: '1200' },
    si: (r) => r.typeObjectif === 'trail',
    secondes: 8,
  },
  {
    champ: 'dateCourse',
    theme: 'Objectif',
    titre: 'À quelle date ?',
    aide: 'Entre 6 et 24 semaines, le plan est complet. Pour un premier 5 km, comptez 8 à 10 semaines.',
    saisie: { genre: 'date' },
    secondes: 12,
  },
  {
    champ: 'tempsViseS',
    theme: 'Objectif',
    titre: 'Visez-vous un temps ?',
    aide: 'Facultatif. Exemple : 45:00 ou 1:45:00.',
    saisie: { genre: 'duree', exemple: '45:00' },
    facultative: true,
    si: aCourse,
    secondes: 10,
  },
  {
    champ: 'aChrono',
    theme: 'Chronos',
    titre: 'Avez-vous un chrono sur une course ou un test couru à fond ?',
    aide: 'De 1500 m au marathon, de moins de deux ans.',
    saisie: { genre: 'choix', options: OUI_NON },
    secondes: 5,
  },
  {
    champ: 'chronoDistanceM',
    theme: 'Chronos',
    titre: 'Sur quelle distance ?',
    aide: 'En kilomètres.',
    saisie: { genre: 'nombre', unite: 'km', min: 0.8, max: 100, exemple: '10', facteur: 1000 },
    si: (r) => r.aChrono === true,
    secondes: 8,
  },
  {
    champ: 'chronoDureeS',
    theme: 'Chronos',
    titre: 'En combien de temps ?',
    aide: 'Exemple : 22:30 ou 1:48:00.',
    saisie: { genre: 'duree', exemple: '48:30' },
    si: (r) => r.aChrono === true,
    secondes: 10,
  },
  {
    champ: 'chronoAnciennete',
    theme: 'Chronos',
    titre: 'De quand date ce chrono ?',
    saisie: {
      genre: 'choix',
      options: [
        { valeur: 'moins3', nom: 'Moins de 3 mois' },
        { valeur: '3a6', nom: '3 à 6 mois' },
        { valeur: '6a12', nom: '6 mois à 1 an' },
        { valeur: 'plus12', nom: 'Plus d’un an' },
      ],
    },
    si: (r) => r.aChrono === true,
    secondes: 5,
  },
  {
    champ: 'allureFootingS',
    theme: 'Chronos',
    titre: 'À quelle allure faites-vous vos footings ?',
    aide: 'Facultatif. En minutes par kilomètre, par exemple 6:15. Laissez vide si vous ne savez pas.',
    saisie: { genre: 'duree', exemple: '6:15' },
    facultative: true,
    si: (r) => r.aChrono === false && aCourse(r),
    secondes: 10,
  },
  {
    champ: 'volumeKm',
    theme: 'Volume et historique',
    titre: 'Combien de kilomètres courez-vous par semaine en ce moment ?',
    aide: 'Moyenne des 4 dernières semaines. 0 si vous ne courez pas.',
    saisie: { genre: 'nombre', unite: 'km', min: 0, max: 250, exemple: '25' },
    secondes: 10,
  },
  {
    champ: 'anneesPratique',
    theme: 'Volume et historique',
    titre: 'Depuis combien de temps courez-vous régulièrement ?',
    saisie: {
      genre: 'choix',
      options: [
        { valeur: 0, nom: 'Je débute' },
        { valeur: 0.5, nom: 'Moins d’un an' },
        { valeur: 2, nom: '1 à 3 ans' },
        { valeur: 5, nom: 'Plus de 3 ans' },
      ],
    },
    secondes: 5,
  },
  {
    champ: 'plusLongueSortieKm',
    theme: 'Volume et historique',
    titre: 'Votre plus longue sortie du dernier mois ?',
    aide: 'En kilomètres. 0 si vous n’avez pas couru.',
    saisie: { genre: 'nombre', unite: 'km', min: 0, max: 120, exemple: '12' },
    secondes: 8,
  },
  {
    champ: 'blessureRecente',
    theme: 'Santé',
    titre: 'Avez-vous été blessé ou arrêté par une douleur ces 3 derniers mois ?',
    saisie: { genre: 'choix', options: OUI_NON },
    secondes: 5,
  },
  {
    champ: 'blessureDetail',
    theme: 'Santé',
    titre: 'Quelle blessure, et où en êtes-vous ?',
    aide: 'Facultatif. Quelques mots suffisent.',
    saisie: { genre: 'texte' },
    facultative: true,
    si: (r) => r.blessureRecente === true,
    secondes: 15,
  },
  {
    champ: 'alerteSante',
    theme: 'Santé',
    titre: 'L’une de ces situations vous concerne-t-elle ?',
    aide: 'Douleur dans la poitrine, essoufflement inhabituel, malaise ou vertiges à l’effort, maladie du cœur, ou un médecin vous a déconseillé le sport.',
    saisie: { genre: 'choix', options: OUI_NON },
    secondes: 12,
  },
  {
    champ: 'jours',
    theme: 'Disponibilités',
    titre: 'Quels jours pouvez-vous courir ?',
    aide: 'Cochez tous les jours possibles, même si vous ne courrez pas chaque jour.',
    saisie: { genre: 'jours' },
    secondes: 10,
  },
  {
    champ: 'sortieLongueJour',
    theme: 'Disponibilités',
    titre: 'Quel jour pour la sortie longue ?',
    aide: 'Le jour où vous avez le plus de temps.',
    saisie: { genre: 'jour' },
    si: (r) => r.jours.length > 1 && aCourse(r),
    secondes: 5,
  },
  {
    champ: 'dureeMaxSemaineMin',
    theme: 'Disponibilités',
    titre: 'En semaine, combien de temps pour une séance ?',
    saisie: {
      genre: 'choix',
      options: [
        { valeur: 30, nom: '30 minutes' },
        { valeur: 45, nom: '45 minutes' },
        { valeur: 60, nom: '1 heure' },
        { valeur: 90, nom: '1 h 30 ou plus' },
      ],
    },
    secondes: 5,
  },
  {
    champ: 'materiel',
    theme: 'Matériel et préférences',
    titre: 'Quel matériel avez-vous ?',
    aide: 'Plusieurs réponses possibles. Aucune n’est obligatoire.',
    saisie: {
      genre: 'multi',
      options: [
        { valeur: 'gps', nom: 'Montre GPS' },
        { valeur: 'cardio', nom: 'Capteur de fréquence cardiaque' },
      ],
    },
    facultative: true,
    secondes: 6,
  },
  {
    champ: 'terrains',
    theme: 'Matériel et préférences',
    titre: 'À quels terrains avez-vous accès ?',
    aide: 'Plusieurs réponses possibles. Les séances s’y adaptent.',
    saisie: {
      genre: 'multi',
      options: [
        { valeur: 'piste', nom: 'Une piste d’athlétisme' },
        { valeur: 'cotes', nom: 'Une côte de 200 m ou plus' },
        { valeur: 'chemins', nom: 'Des chemins ou sentiers' },
      ],
    },
    facultative: true,
    secondes: 8,
  },
  {
    champ: 'fcMax',
    theme: 'Matériel et préférences',
    titre: 'Connaissez-vous votre fréquence cardiaque maximale ?',
    aide: 'Facultatif. Mesurée à l’effort, pas calculée. Laissez vide sinon.',
    saisie: { genre: 'nombre', unite: 'bpm', min: 120, max: 230, exemple: '186' },
    facultative: true,
    si: (r) => r.materiel.includes('cardio'),
    secondes: 8,
  },
]

export function questionsVisibles(r: Reponses): Question[] {
  return QUESTIONS.filter((q) => !q.si || q.si(r))
}

/** La question a-t-elle la réponse qu'il lui faut ? Les facultatives passent toujours. */
export function estRepondue(q: Question, r: Reponses): boolean {
  if (q.facultative) return true
  const v = r[q.champ]
  if (Array.isArray(v)) return v.length > 0
  return v !== null && v !== ''
}

// ───────────────────────── Calcul du profil ─────────────────────────

// Confiance dans le chrono selon son âge. Daniels (2014) règle les allures sur
// une performance récente ; les paliers de 3, 6 et 12 mois sont un choix
// d'entraîneur.
const FIABILITE: Record<Anciennete, Fiabilite> = { moins3: 'bonne', '3a6': 'moyenne', '6a12': 'faible', plus12: 'faible' }
const JOURS_DEPUIS: Record<Anciennete, number> = { moins3: 45, '3a6': 135, '6a12': 270, plus12: 450 }

// Après une blessure récente, on repart de 80 % du volume déclaré. Prudence
// d'entraîneur, sans source chiffrée : la reprise se décide avec un soignant.
const FACTEUR_BLESSURE = 0.8

/**
 * Nombre maximal de séances par semaine : 3 pour le premier 5 km, 4 au
 * niveau 1, 5 au niveau 2, 6 au niveau 3 (un jour de repos au moins).
 * Choix d'entraîneur : la fréquence monte avec l'expérience.
 */
export function seancesMax(niveau: Niveau, debutant: boolean): number {
  return debutant ? 3 : niveau + 3
}

/** Jours retenus : parmi les jours cochés, les plus espacés, sortie longue comprise. */
export function joursPossibles(jours: JourSemaine[], max: number, sortieLongue: JourSemaine | null): JourSemaine[] {
  const tries = [...new Set(jours)].sort((a, b) => a - b)
  if (tries.length <= max) return tries
  const garde = sortieLongue !== null && tries.includes(sortieLongue) ? [sortieLongue] : []
  const autres = placerJoursDurs(tries, max - garde.length, garde) as JourSemaine[]
  return [...garde, ...autres].sort((a, b) => a - b)
}

export interface ResultatQuestionnaire {
  profil: Profil
  evaluation: Evaluation | null
  objectif: Objectif
  /** Conseils de prudence à afficher avant de commencer. */
  conseils: string[]
  /** Remarques sur la fiabilité des estimations. */
  remarques: string[]
}

const NOMS_COURSES: Record<TypeObjectif, string> = { premier5k: 'Mon premier 5 km', piste: 'Piste', route: 'Route', cross: 'Cross', trail: 'Trail' }

export function calculerProfil(r: Reponses, jour: DateIso, idEvaluation: string, idObjectif: string): ResultatQuestionnaire {
  if (r.anneeNaissance === null || r.typeObjectif === '' || r.dateCourse === '') throw new Error('Le questionnaire est incomplet.')
  const debutant = r.typeObjectif === 'premier5k'
  const annees = r.anneesPratique ?? 0
  const volumeDeclare = r.volumeKm ?? 0
  const niveau = determinerNiveau(annees, volumeDeclare, debutant)
  const conseils: string[] = []
  const remarques: string[] = []

  // ── Santé ──
  if (r.alerteSante) {
    // Questionnaire d'aptitude PAR-Q+ (Warburton et al., 2011) : une réponse positive renvoie vers un médecin.
    conseils.push('Vous avez signalé un symptôme ou une contre-indication : consultez un médecin avant de commencer ce plan.')
  }
  if (r.blessureRecente) {
    conseils.push(
      'Blessure récente : consultez un médecin ou un kinésithérapeute avant de reprendre. Le plan démarre avec un volume réduit ; arrêtez-vous à la moindre douleur qui modifie votre foulée.',
    )
  }
  const age = Number(jour.slice(0, 4)) - r.anneeNaissance
  if (age >= 45 && annees < 1 && !r.alerteSante) {
    // Dépistage avant la reprise du sport : Riebe et al. (2015), recommandations ACSM. Seuil de 45 ans : choix d'entraîneur.
    conseils.push('Vous débutez ou reprenez après 45 ans : un bilan chez votre médecin avant de commencer est conseillé.')
  }

  // ── Niveau de performance ──
  let evaluation: Evaluation | null = null
  if (r.aChrono && r.chronoDistanceM && r.chronoDureeS) {
    const anciennete = r.chronoAnciennete || 'moins3'
    evaluation = evaluer(
      { type: 'course', distanceM: r.chronoDistanceM, dureeS: r.chronoDureeS },
      ajouterJours(jour, -JOURS_DEPUIS[anciennete]),
      idEvaluation,
      'Questionnaire',
      FIABILITE[anciennete],
    )
    if (evaluation.fiabilite !== 'bonne') {
      remarques.push('Votre chrono a plus de 3 mois : les allures sont indicatives. Refaites un test ou une course dans les prochaines semaines.')
    }
  } else if (!debutant && r.allureFootingS) {
    evaluation = evaluer({ type: 'footing', allureSParKm: r.allureFootingS }, jour, idEvaluation, 'Estimé d’après l’allure de footing')
    remarques.push('Sans chrono, votre niveau est estimé d’après votre allure de footing : c’est approximatif. Faites un test de 6 minutes (demi-Cooper) dès que possible.')
  } else if (!debutant) {
    remarques.push('Sans chrono ni allure de footing, les allures ne peuvent pas être calculées. Faites un test de 6 minutes (demi-Cooper) puis saisissez-le dans le profil.')
  }

  // ── Volume de départ et jours ──
  const volumeDepart = Math.round(volumeDeclare * (r.blessureRecente ? FACTEUR_BLESSURE : 1))
  const jours = joursPossibles(r.jours, seancesMax(niveau, debutant), r.sortieLongueJour)
  if (jours.length < r.jours.length) {
    remarques.push(`Vous avez coché ${r.jours.length} jours ; à votre niveau le plan en utilise ${jours.length}, pour garder des jours de repos.`)
  }

  const profil: Profil = {
    id: 'moi',
    version: VERSION_DONNEES,
    prenom: r.prenom.trim(),
    anneeNaissance: r.anneeNaissance,
    anneesPratique: annees,
    volumeHebdoKm: volumeDepart,
    joursDisponibles: jours,
    blessures: r.blessureRecente ? r.blessureDetail.trim() || 'Blessure récente' : '',
    niveau,
    blessureRecente: r.blessureRecente === true,
    alerteSante: r.alerteSante === true,
    materiel: { gps: r.materiel.includes('gps'), cardio: r.materiel.includes('cardio') },
    terrains: { piste: r.terrains.includes('piste'), cotes: r.terrains.includes('cotes'), chemins: r.terrains.includes('chemins') },
    ...(r.sexe ? { sexe: r.sexe } : {}),
    ...(r.fcMax ? { fcMax: r.fcMax } : {}),
    ...(r.fcRepos ? { fcRepos: r.fcRepos } : {}),
    ...(r.sortieLongueJour !== null && jours.includes(r.sortieLongueJour) ? { sortieLongueJour: r.sortieLongueJour } : {}),
    ...(r.dureeMaxSemaineMin ? { dureeMaxSemaineMin: r.dureeMaxSemaineMin } : {}),
    ...(r.plusLongueSortieKm !== null ? { plusLongueSortieKm: r.plusLongueSortieKm } : {}),
  }

  const distanceM = debutant ? 5000 : Math.round(r.distanceM ?? 10000)
  const objectif: Objectif = {
    id: idObjectif,
    version: VERSION_DONNEES,
    type: r.typeObjectif,
    nom: debutant ? NOMS_COURSES.premier5k : `${NOMS_COURSES[r.typeObjectif]} ${String(Math.round(distanceM / 100) / 10).replace('.', ',')} km`,
    distanceM,
    date: r.dateCourse,
    ...(r.tempsViseS && !debutant ? { tempsViseS: r.tempsViseS } : {}),
    ...(r.typeObjectif === 'trail' && r.deniveleM ? { deniveleM: r.deniveleM } : {}),
  }

  return { profil, evaluation, objectif, conseils, remarques }
}

/** Réponses reconstituées à partir des données enregistrées, pour modifier le questionnaire. */
export function reponsesDepuis(profil: Profil, objectif: Objectif | null, evaluation: Evaluation | null): Reponses {
  const chrono = evaluation && evaluation.type !== 'footing' ? evaluation : null
  return {
    ...reponsesVides(),
    prenom: profil.prenom,
    anneeNaissance: profil.anneeNaissance,
    sexe: profil.sexe ?? '',
    typeObjectif: objectif?.type ?? '',
    distanceM: objectif ? objectif.distanceM : null,
    deniveleM: objectif?.deniveleM ?? null,
    dateCourse: objectif?.date ?? '',
    tempsViseS: objectif?.tempsViseS ?? null,
    aChrono: evaluation ? chrono !== null : null,
    chronoDistanceM: chrono?.distanceM ?? null,
    chronoDureeS: chrono?.dureeS ?? null,
    chronoAnciennete: chrono ? (chrono.fiabilite === 'bonne' ? 'moins3' : chrono.fiabilite === 'moyenne' ? '3a6' : '6a12') : '',
    allureFootingS: evaluation?.type === 'footing' ? Math.round(1800 / (evaluation.distanceM / 1000)) : null,
    volumeKm: profil.volumeHebdoKm,
    anneesPratique: profil.anneesPratique,
    plusLongueSortieKm: profil.plusLongueSortieKm ?? null,
    blessureRecente: profil.blessureRecente,
    blessureDetail: profil.blessures,
    alerteSante: profil.alerteSante,
    jours: profil.joursDisponibles,
    sortieLongueJour: profil.sortieLongueJour ?? null,
    dureeMaxSemaineMin: profil.dureeMaxSemaineMin ?? null,
    materiel: [...(profil.materiel.gps ? (['gps'] as const) : []), ...(profil.materiel.cardio ? (['cardio'] as const) : [])],
    terrains: (['piste', 'cotes', 'chemins'] as const).filter((t) => profil.terrains[t]),
    fcMax: profil.fcMax ?? null,
    fcRepos: profil.fcRepos ?? null,
  }
}
