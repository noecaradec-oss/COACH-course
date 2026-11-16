// Sauvegarde : tout le contenu de l'appli dans un fichier JSON, et retour.
// Sans compte ni serveur, c'est le seul moyen de changer de téléphone ou de
// se protéger d'un effacement des données du navigateur.

import { type Donnees, VERSION_DONNEES } from '../domaine/modele'
import { migrer } from './migration'

const FORMAT = 'coach-course'

export function donneesVides(): Donnees {
  return { profil: null, evaluations: [], objectifs: [], plans: [], activites: [] }
}

export function exporter(donnees: Donnees, date: string): string {
  return JSON.stringify({ format: FORMAT, version: VERSION_DONNEES, exporteLe: date, donnees }, null, 2)
}

export class ErreurSauvegarde extends Error {}

const COLLECTIONS = ['evaluations', 'objectifs', 'plans', 'activites'] as const

/** Relit une sauvegarde. Lève ErreurSauvegarde avec un message lisible. */
export function importer(texte: string): Donnees {
  let brut: unknown
  try {
    brut = JSON.parse(texte)
  } catch {
    throw new ErreurSauvegarde('Ce fichier n’est pas une sauvegarde lisible.')
  }
  const fichier = brut as { format?: unknown; version?: unknown; donnees?: Record<string, unknown> }
  if (typeof fichier !== 'object' || fichier === null || fichier.format !== FORMAT) {
    throw new ErreurSauvegarde('Ce fichier n’est pas une sauvegarde de Coach Course.')
  }
  if (typeof fichier.version !== 'number' || fichier.version > VERSION_DONNEES) {
    throw new ErreurSauvegarde('Cette sauvegarde vient d’une version plus récente de l’appli. Mettez l’appli à jour.')
  }
  const d = fichier.donnees
  if (typeof d !== 'object' || d === null) throw new ErreurSauvegarde('La sauvegarde est vide.')
  const resultat = donneesVides()
  if (d.profil !== null && d.profil !== undefined) {
    if (typeof d.profil !== 'object' || (d.profil as { id?: unknown }).id !== 'moi') {
      throw new ErreurSauvegarde('Le profil de la sauvegarde est illisible.')
    }
    resultat.profil = d.profil as Donnees['profil']
  }
  for (const nom of COLLECTIONS) {
    const liste = d[nom]
    if (!Array.isArray(liste) || liste.some((x) => typeof x !== 'object' || x === null || typeof x.id !== 'string')) {
      throw new ErreurSauvegarde(`La partie « ${nom} » de la sauvegarde est illisible.`)
    }
    ;(resultat[nom] as unknown[]) = liste
  }
  // Une sauvegarde faite avec une version précédente est mise à niveau.
  return migrer(resultat)
}
