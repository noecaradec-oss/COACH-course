// Export du journal au format CSV, pour un tableur ou pour un entraîneur.
// Chaque ligne met le prévu en regard du réalisé.
//
// Choix de format pour qu'Excel et LibreOffice en français l'ouvrent sans
// réglage : séparateur point-virgule, virgule décimale, fins de ligne
// Windows, et marque d'encodage UTF-8 en tête de fichier.

import type { Comparaison } from '../domaine/tableauDeBord'

const SEPARATEUR = ';'
const MARQUE_UTF8 = '﻿'

const NOMS_STATUTS = { faite: 'Faite', manquee: 'Manquée', horsPlan: 'Hors plan' }

function cellule(valeur: string | number | null | undefined): string {
  if (valeur === null || valeur === undefined) return ''
  if (typeof valeur === 'number') return String(valeur).replace('.', ',')
  // Une cellule qui commence par = + - @ serait lue comme une formule par le tableur.
  const texte = /^[=+\-@]/.test(valeur) ? `'${valeur}` : valeur
  return /[";\n\r]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte
}

/** Allure en minutes décimales par km, plus simple à exploiter dans un tableur que « 5:30 ». */
function allure(dureeS: number, distanceM: number): number | null {
  return distanceM > 0 ? Math.round((dureeS / 60 / (distanceM / 1000)) * 100) / 100 : null
}

export const COLONNES_CSV = [
  'Date',
  'Statut',
  'Séance prévue',
  'Type',
  'Distance prévue (km)',
  'Distance réalisée (km)',
  'Durée prévue (min)',
  'Durée réalisée (min)',
  'Allure réalisée (min/km)',
  'FC moyenne',
  'FC max',
  'Dénivelé positif (m)',
  'RPE prévu',
  'RPE réalisé',
  'Écart RPE',
  'Charge (RPE × min)',
  'Tours',
  'Source',
  'Commentaire',
]

export function exporterCsv(lignes: Comparaison[]): string {
  const rangs = lignes.map(({ date, statut, prevue, activite: a, ecartRpe, charge }) => [
    date,
    NOMS_STATUTS[statut],
    prevue?.titre,
    prevue?.type,
    prevue?.distanceKm,
    a ? Math.round(a.distanceM / 10) / 100 : null,
    prevue?.dureeMin,
    a ? Math.round(a.dureeS / 6) / 10 : null,
    a ? allure(a.dureeS, a.distanceM) : null,
    a?.fcMoy,
    a?.fcMax,
    a?.denivelePosM,
    prevue?.rpeVise,
    a?.rpe,
    ecartRpe,
    charge,
    a && a.tours.length > 0 ? a.tours.length : null,
    a ? (a.source === 'fit' ? 'Fichier .fit' : 'Saisie') : null,
    a?.commentaire,
  ])
  return MARQUE_UTF8 + [COLONNES_CSV, ...rangs].map((r) => r.map(cellule).join(SEPARATEUR)).join('\r\n') + '\r\n'
}
