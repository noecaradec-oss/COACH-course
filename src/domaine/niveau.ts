import type { Niveau } from './seances'

/**
 * Niveau du coureur, de 1 à 3. Il choisit les fiches de la base de séances.
 * Seuils d'entraîneur, sans source :
 * - 1 (débutant) : moins d'un an de pratique, ou moins de 15 km par semaine ;
 * - 3 (confirmé) : au moins 3 ans de pratique et 45 km par semaine ;
 * - 2 (intermédiaire) : les autres.
 * Le niveau dépend de l'expérience et du volume encaissé, pas de la vitesse :
 * un coureur rapide mais novice reste fragile.
 */
export function determinerNiveau(anneesPratique: number, volumeKm: number, debutant: boolean): Niveau {
  if (debutant || anneesPratique < 1 || volumeKm < 15) return 1
  if (anneesPratique >= 3 && volumeKm >= 45) return 3
  return 2
}
