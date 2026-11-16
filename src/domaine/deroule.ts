// Déroulé d'une séance, étape par étape, pour l'écran utilisé en courant.

import { formaterAllure, formaterDuree } from './format'
import type { Bloc, SeancePrevue } from './modele'
import type { Allures } from './vdot'

export interface Etape {
  /** Ce qu'il faut faire, en quelques mots lisibles d'un coup d'œil. */
  titre: string
  /** Allure, zone ou précision. */
  detail: string
  /** Position dans une série : « 3 / 8 ». */
  repetition?: string
  dureeS?: number
  distanceM?: number
  genre: 'effort' | 'recuperation' | 'facile' | 'exercice'
  partie: 'Échauffement' | 'Séance' | 'Retour au calme' | 'Complément'
}

const PARTIES = { echauffement: 'Échauffement', corps: 'Séance', retour: 'Retour au calme', complement: 'Complément' } as const

const NOMS_ALLURES: Record<Bloc['allure'], string> = {
  E: 'Endurance',
  M: 'Allure marathon',
  T: 'Seuil',
  I: 'Vite',
  R: 'Très vite, relâché',
  marche: 'Marche',
  aisance: 'Course lente',
  course: 'Course',
  exercice: 'Exercice',
}

function detailAllure(bloc: Bloc, allures: Allures | null): string {
  const parties: string[] = []
  if (allures) {
    if (bloc.allure === 'E') parties.push(`${formaterDuree(allures.E.rapide)} à ${formaterAllure(allures.E.lente)}`)
    else if (bloc.allure === 'aisance') parties.push(`vers ${formaterAllure(allures.E.lente)} ou plus lent`)
    // En côte, l'allure à plat n'a pas de sens : on vise l'effort.
    else if ((bloc.allure === 'M' || bloc.allure === 'T' || bloc.allure === 'I' || bloc.allure === 'R') && !bloc.libelle?.includes('Côte')) {
      parties.push(formaterAllure(allures[bloc.allure]))
    }
  }
  if (bloc.zone) parties.push(`zone ${bloc.zone}`)
  if (bloc.libelle && bloc.allure !== 'exercice') parties.push(bloc.libelle)
  return parties.join(' · ')
}

/**
 * Développe les blocs d'une séance en étapes : chaque répétition devient une
 * étape d'effort suivie de sa récupération (sauf après la dernière).
 */
export function etapesDe(seance: SeancePrevue, allures: Allures | null): Etape[] {
  const etapes: Etape[] = []
  for (const bloc of seance.blocs) {
    const partie = PARTIES[bloc.partie ?? 'corps']
    const exercice = bloc.allure === 'exercice'
    const intense = bloc.allure === 'M' || bloc.allure === 'T' || bloc.allure === 'I' || bloc.allure === 'R'
    for (let i = 1; i <= bloc.repetitions; i++) {
      etapes.push({
        titre: exercice ? (bloc.libelle ?? 'Exercice') : NOMS_ALLURES[bloc.allure],
        detail: exercice ? '' : detailAllure(bloc, allures),
        ...(bloc.repetitions > 1 ? { repetition: `${i} / ${bloc.repetitions}` } : {}),
        ...(bloc.dureeS !== undefined ? { dureeS: bloc.dureeS } : {}),
        ...(bloc.distanceM !== undefined ? { distanceM: bloc.distanceM } : {}),
        genre: exercice ? 'exercice' : intense ? 'effort' : 'facile',
        partie,
      })
      if (bloc.recupS && i < bloc.repetitions) {
        etapes.push({
          titre: bloc.recupMode === 'marche' ? 'Récupération en marchant' : bloc.recupMode === 'arret' ? 'Repos' : 'Récupération en trottinant',
          detail: `avant la répétition ${i + 1} / ${bloc.repetitions}`,
          dureeS: bloc.recupS,
          genre: 'recuperation',
          partie,
        })
      }
    }
  }
  return etapes
}
