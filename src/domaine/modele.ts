// Structure des données enregistrées sur l'appareil.
// Cinq collections : profil, évaluations, objectifs, plans, activités.
// Chaque enregistrement porte `version` pour pouvoir migrer plus tard.
// Ne pas modifier ces types sans accord : ils définissent le format stocké.

import type { CategorieIntensite } from './charge'
import type { DateIso } from './dates'
import type { CodeAllure } from './vdot'

export const VERSION_DONNEES = 1

export type Sexe = 'femme' | 'homme'

/** 0 = lundi … 6 = dimanche. */
export type JourSemaine = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface Profil {
  id: 'moi'
  version: number
  prenom: string
  anneeNaissance: number
  /** Sert uniquement au calcul du TRIMP (Banister, 1991). Facultatif. */
  sexe?: Sexe
  anneesPratique: number
  /** Kilométrage hebdomadaire moyen des dernières semaines. */
  volumeHebdoKm: number
  joursDisponibles: JourSemaine[]
  /** FC max mesurée ; sinon l'appli l'estime par l'âge. */
  fcMax?: number
  fcRepos?: number
  blessures: string
}

export type TypeEvaluation = 'course' | 'demiCooper' | 'vameval'

export interface Evaluation {
  id: string
  version: number
  date: DateIso
  type: TypeEvaluation
  /** Performance ramenée à une distance et une durée (6 min pour les tests de VMA). */
  distanceM: number
  dureeS: number
  vdot: number
  vmaKmh: number
  note: string
}

export type TypeObjectif = 'premier5k' | 'piste' | 'route' | 'cross' | 'trail'

export interface Objectif {
  id: string
  version: number
  type: TypeObjectif
  nom: string
  distanceM: number
  date: DateIso
  tempsViseS?: number
  /** Dénivelé positif (trail). */
  deniveleM?: number
}

/**
 * Allures du coureur évalué, repères au ressenti pour le débutant, ou
 * « exercice » pour ce qui ne se court pas (renforcement, éducatifs, mobilité).
 */
export type AllureBloc = CodeAllure | 'marche' | 'aisance' | 'course' | 'exercice'

export interface Bloc {
  repetitions: number
  /** Un bloc est défini par sa durée ou par sa distance. */
  dureeS?: number
  distanceM?: number
  allure: AllureBloc
  /** Récupération entre les répétitions. */
  recupS?: number
  recupMode?: 'trot' | 'marche' | 'arret'
  /** Zone cardiaque visée, de 1 à 5 (Seiler, 2010). */
  zone?: number
  /** Précision affichée : nom de l'exercice, type de terrain, consigne courte. */
  libelle?: string
  /** Place du bloc dans la séance. */
  partie?: 'echauffement' | 'corps' | 'retour' | 'complement'
}

export type TypeSeance =
  | 'footing'
  | 'sortieLongue'
  | 'seuil'
  | 'intervalles'
  | 'repetitions'
  | 'allureMarathon'
  | 'cotes'
  | 'rappel'
  | 'marcheCourse'
  | 'course'

export type Phase = 'debutant' | 'base' | 'specifique' | 'affutage'

export interface SeancePrevue {
  id: string
  date: DateIso
  type: TypeSeance
  titre: string
  categorie: CategorieIntensite
  blocs: Bloc[]
  /** Estimations calculées avec le niveau du coureur à la création du plan. */
  distanceKm: number
  dureeMin: number
  consigne: string
}

export interface SemainePlan {
  numero: number
  /** Lundi de la semaine. */
  debut: DateIso
  phase: Phase
  allegee: boolean
  volumeKm: number
  seances: SeancePrevue[]
}

export interface Plan {
  id: string
  version: number
  objectifId: string
  creeLe: DateIso
  /** Niveau utilisé pour dimensionner le plan ; absent pour le débutant non évalué. */
  vdotDepart?: number
  semaines: SemainePlan[]
  avertissements: string[]
}

export interface Tour {
  distanceM: number
  dureeS: number
  fcMoy?: number
}

export interface Activite {
  id: string
  version: number
  date: DateIso
  source: 'fit' | 'manuel'
  nomFichier?: string
  distanceM: number
  dureeS: number
  fcMoy?: number
  fcMax?: number
  denivelePosM?: number
  deniveleNegM?: number
  /** Distance à plat équivalente (Minetti, 2002), si le dénivelé est connu. */
  distanceEquivPlatM?: number
  /** Secondes passées dans chacune des 5 zones de FC. */
  tempsZonesS?: number[]
  trimp?: number
  tours: Tour[]
  /** Ressenti de la séance, de 0 à 10 (Foster, 2001). */
  rpe?: number
  commentaire: string
  /** Séance du plan à laquelle l'activité répond. */
  seanceId?: string
}

/** Tout ce que contient l'appli, tel qu'exporté dans une sauvegarde. */
export interface Donnees {
  profil: Profil | null
  evaluations: Evaluation[]
  objectifs: Objectif[]
  plans: Plan[]
  activites: Activite[]
}
