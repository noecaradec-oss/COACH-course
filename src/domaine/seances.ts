// Base de séances : les fiches dans lesquelles le moteur de planification
// pioche. Le contenu est dans src/donnees/seances.json, fabriqué par
// scripts/generer-seances.mjs ; chaque fiche cite la source de son type.

import base from '../donnees/seances.json'
import type { CategorieIntensite } from './charge'
import type { Bloc, Phase } from './modele'

export type TypeFiche =
  | 'endurance'
  | 'sortieLongue'
  | 'seuil'
  | 'allureSpecifique'
  | 'vmaLongue'
  | 'vmaCourte'
  | 'vitesse'
  | 'cotes'
  | 'fartlek'
  | 'renfo'
  | 'educatifs'
  | 'recuperation'
  | 'marcheCourse'
  | 'affutage'

export const TYPES_FICHE: TypeFiche[] = [
  'endurance',
  'sortieLongue',
  'seuil',
  'allureSpecifique',
  'vmaLongue',
  'vmaCourte',
  'vitesse',
  'cotes',
  'fartlek',
  'renfo',
  'educatifs',
  'recuperation',
  'marcheCourse',
  'affutage',
]

/** 1 = débutant, 2 = intermédiaire, 3 = confirmé. */
export type Niveau = 1 | 2 | 3

/** Famille de distance préparée ; « tous » = convient à toutes. */
export type Cible = 'tous' | 'debutant' | 'demiFond' | 'cinqDix' | 'semi' | 'marathon' | 'trail'

export interface FicheSeance {
  id: string
  type: TypeFiche
  niveau: Niveau
  titre: string
  objectif: string
  phases: Phase[]
  pour: Cible[]
  categorie: CategorieIntensite
  echauffement: Bloc[]
  corps: Bloc[]
  retourAuCalme: Bloc[]
  /** Ressenti attendu, de 1 à 10 (Foster et al., 2001). */
  rpeVise: number
  /** Durée estimée pour un coureur type du niveau. */
  dureeMin: number
  variantes: { plusFacile: string; plusDure: string }
  source: string
  /** Fiches d'endurance dont le moteur peut régler la durée (bornes en minutes). */
  ajustable?: { minMin: number; maxMin: number }
  /** Terrain nécessaire, s'il y en a un. */
  terrain?: 'piste' | 'cote'
}

export const SEANCES = (base as unknown as { seances: FicheSeance[] }).seances

/** VDOT du coureur type de chaque niveau, utilisé pour les durées estimées des fiches. */
export const VDOT_REFERENCE: Record<Niveau, number> = { 1: 32, 2: 45, 3: 56 }

/** Tous les blocs d'une fiche, dans l'ordre, avec leur place dans la séance. */
export function blocsDe(fiche: FicheSeance): Bloc[] {
  return [
    ...fiche.echauffement.map((b): Bloc => ({ ...b, partie: 'echauffement' })),
    ...fiche.corps.map((b): Bloc => ({ ...b, partie: 'corps' })),
    ...fiche.retourAuCalme.map((b): Bloc => ({ ...b, partie: 'retour' })),
  ]
}

export interface Criteres {
  type: TypeFiche
  niveau: Niveau
  cible?: Cible
  /** Terrains dont dispose le coureur ; sans piste, on écarte les fiches qui l'exigent. */
  piste?: boolean
}

/**
 * Fiches d'un type et d'un niveau, dans l'ordre de la base (de la plus
 * accessible à la plus exigeante). Si aucune fiche ne correspond à la cible
 * ou au terrain, on relâche ces deux filtres plutôt que de ne rien proposer.
 */
export function fichesPour(c: Criteres, base: FicheSeance[] = SEANCES): FicheSeance[] {
  const duType = base.filter((f) => f.type === c.type && f.niveau === c.niveau)
  const filtrees = duType.filter(
    (f) => (c.piste !== false || f.terrain !== 'piste') && (!c.cible || f.pour.includes('tous') || f.pour.includes(c.cible)),
  )
  return filtrees.length > 0 ? filtrees : duType
}
