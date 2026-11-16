// Stockage sur l'appareil (IndexedDB, via la bibliothèque idb).
// Une « boîte » par collection du modèle de données.

import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { Activite, Donnees, Evaluation, Objectif, Plan, Profil } from '../domaine/modele'

interface Schema extends DBSchema {
  profil: { key: string; value: Profil }
  evaluations: { key: string; value: Evaluation }
  objectifs: { key: string; value: Objectif }
  plans: { key: string; value: Plan }
  activites: { key: string; value: Activite }
}

export type Collection = 'evaluations' | 'objectifs' | 'plans' | 'activites'
const COLLECTIONS: Collection[] = ['evaluations', 'objectifs', 'plans', 'activites']

let ouverture: Promise<IDBPDatabase<Schema>> | null = null

function base(): Promise<IDBPDatabase<Schema>> {
  ouverture ??= openDB<Schema>('coach-course', 1, {
    upgrade(db) {
      db.createObjectStore('profil', { keyPath: 'id' })
      for (const nom of COLLECTIONS) db.createObjectStore(nom, { keyPath: 'id' })
    },
  })
  return ouverture
}

export async function chargerTout(): Promise<Donnees> {
  const db = await base()
  const [profil, evaluations, objectifs, plans, activites] = await Promise.all([
    db.get('profil', 'moi'),
    db.getAll('evaluations'),
    db.getAll('objectifs'),
    db.getAll('plans'),
    db.getAll('activites'),
  ])
  return { profil: profil ?? null, evaluations, objectifs, plans, activites }
}

export async function enregistrerProfil(profil: Profil): Promise<void> {
  await (await base()).put('profil', profil)
}

export async function enregistrer<C extends Collection>(collection: C, valeur: Schema[C]['value']): Promise<void> {
  await (await base()).put(collection, valeur)
}

export async function supprimer(collection: Collection, id: string): Promise<void> {
  await (await base()).delete(collection, id)
}

/** Remplace tout le contenu (restauration d'une sauvegarde), en une seule transaction. */
export async function remplacerTout(donnees: Donnees): Promise<void> {
  const db = await base()
  const tx = db.transaction(['profil', ...COLLECTIONS], 'readwrite')
  await tx.objectStore('profil').clear()
  if (donnees.profil) await tx.objectStore('profil').put(donnees.profil)
  for (const nom of COLLECTIONS) {
    const boite = tx.objectStore(nom)
    await boite.clear()
    for (const valeur of donnees[nom]) await (boite as unknown as { put(v: unknown): Promise<unknown> }).put(valeur)
  }
  await tx.done
}

/**
 * Demande au navigateur de ne pas effacer les données quand la place manque.
 * Sans effet si le navigateur refuse ; la sauvegarde manuelle reste le filet.
 */
export async function demanderPersistance(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
