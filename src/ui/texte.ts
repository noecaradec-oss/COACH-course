// Mise en mots des séances pour l'affichage.

import type { CategorieIntensite } from '../domaine/charge'
import { formaterAllure, formaterDuree } from '../domaine/format'
import type { Bloc, Phase, TypeEvaluation, TypeObjectif, TypeSeance } from '../domaine/modele'
import type { Allures, Realisme } from '../domaine/vdot'

export function dureeCourte(secondes: number): string {
  if (secondes < 60) return `${secondes} s`
  const m = Math.floor(secondes / 60)
  const s = secondes % 60
  return s === 0 ? `${m} min` : `${m} min ${s}`
}

function effort(bloc: Bloc): string {
  if (bloc.dureeS !== undefined) return dureeCourte(bloc.dureeS)
  const d = bloc.distanceM ?? 0
  return d >= 1000 ? `${(d / 1000).toFixed(d % 1000 === 0 ? 0 : 1).replace('.', ',')} km` : `${d} m`
}

function intensite(bloc: Bloc, allures: Allures | null, type: TypeSeance): string {
  switch (bloc.allure) {
    case 'marche':
      return 'de marche'
    case 'aisance':
      return 'de course lente'
    case 'course':
    case 'exercice':
      return ''
    case 'E':
      return allures
        ? `en endurance (${formaterDuree(allures.E.rapide)} à ${formaterAllure(allures.E.lente)})`
        : 'en endurance'
    case 'M':
      return allures ? `à allure marathon (${formaterAllure(allures.M)})` : 'à allure marathon'
    case 'T':
      return allures ? `au seuil (${formaterAllure(allures.T)})` : 'au seuil'
    case 'I':
      if (type === 'cotes') return 'en côte, effort soutenu'
      return allures ? `à ${formaterAllure(allures.I)}` : 'vite'
    case 'R':
      return allures ? `vite, vers ${formaterAllure(allures.R)}` : 'vite'
  }
}

export function decrireBloc(bloc: Bloc, allures: Allures | null, type: TypeSeance): string {
  const base = `${bloc.repetitions > 1 ? `${bloc.repetitions} × ` : ''}${effort(bloc)} ${intensite(bloc, allures, type)}`.trim()
  if (!bloc.recupS || bloc.repetitions <= 1) return base
  return `${base}, récupération ${dureeCourte(bloc.recupS)} ${bloc.recupMode === 'marche' ? 'en marchant' : 'en trottinant'}`
}

export const NOMS_PHASES: Record<Phase, string> = {
  debutant: 'Marche-course',
  base: 'Base',
  specifique: 'Spécifique',
  affutage: 'Affûtage',
}

export const NOMS_CATEGORIES: Record<CategorieIntensite, string> = {
  facile: 'Facile',
  seuil: 'Seuil',
  intense: 'Intense',
}

export const NOMS_OBJECTIFS: Record<TypeObjectif, string> = {
  premier5k: 'Mon premier 5 km',
  piste: 'Piste',
  route: 'Route',
  cross: 'Cross',
  trail: 'Trail',
}

export const NOMS_EVALUATIONS: Record<TypeEvaluation, string> = {
  course: 'Course ou chrono',
  demiCooper: 'Demi-Cooper (6 min)',
  vameval: 'VAMEVAL',
}

export const TEXTES_REALISME: Record<Realisme, string> = {
  acquis: 'Vous avez déjà ce niveau : visez plus haut si le cœur vous en dit.',
  realiste: 'Objectif réaliste avec le temps dont vous disposez.',
  ambitieux: 'Objectif ambitieux : possible si tout se passe bien, sans garantie.',
  peuRealiste: 'Objectif peu réaliste dans ce délai. Un temps intermédiaire serait plus sûr.',
}

// Échelle de ressenti de la séance, de 0 à 10 (Foster et al., 2001).
export const NOMS_RPE = ['Repos', 'Très, très facile', 'Facile', 'Modéré', 'Un peu dur', 'Dur', 'Dur', 'Très dur', 'Très dur', 'Extrêmement dur', 'Maximal']
