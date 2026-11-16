// Second avis sur les prédictions de temps.

// Riegel (1981), « Athletic records and human endurance », American
// Scientist : T2 = T1 × (D2 / D1)^1,06. L'auteur donne la loi valable pour
// des efforts d'environ 3 min 30 à 230 min. Exposant cité de mémoire.
const EXPOSANT_RIEGEL = 1.06

export function predireRiegel(distanceConnueM: number, dureeConnueS: number, distanceCibleM: number): number {
  return dureeConnueS * (distanceCibleM / distanceConnueM) ** EXPOSANT_RIEGEL
}
