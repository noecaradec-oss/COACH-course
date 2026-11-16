// Dénivelé : conversion d'un parcours vallonné en distance équivalente à plat.

/**
 * Coût énergétique de la course (J/kg/m) selon la pente i (0,10 = 10 %).
 * Minetti et al. (2002), J Appl Physiol, « Energy cost of walking and running
 * at extreme uphill and downhill slopes » : polynôme du 5e degré, mesuré
 * entre −45 % et +45 %. Coefficients cités de mémoire : l'article n'a pas pu
 * être relu (site inaccessible le 16/11/2026). À recouper.
 */
export function coutCourse(pente: number): number {
  const i = Math.min(0.45, Math.max(-0.45, pente))
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6
}

const COUT_A_PLAT = coutCourse(0)

export interface Segment {
  distanceM: number
  deniveleM: number
}

/**
 * Distance à plat qui coûterait la même énergie. Application directe de
 * Minetti et al. (2002). Limite : le modèle ne compte que l'énergie. En
 * descente il annonce un coût plus faible qu'à plat, alors que la casse
 * musculaire et la technique ralentissent en trail : résultat optimiste.
 */
export function distanceEquivalentePlat(segments: Segment[]): number {
  let total = 0
  for (const s of segments) {
    if (s.distanceM <= 0) continue
    total += (s.distanceM * coutCourse(s.deniveleM / s.distanceM)) / COUT_A_PLAT
  }
  return total
}

/**
 * Quand on ne connaît que la distance et les dénivelés totaux, on suppose
 * une moitié du parcours en montée régulière et l'autre en descente
 * régulière. Simplification d'entraîneur, sans source : un vrai profil
 * (fichier .fit) donne un résultat plus fiable.
 */
export function distanceEquivalenteApprochee(distanceM: number, denivelePosM: number, deniveleNegM = denivelePosM): number {
  return distanceEquivalentePlat([
    { distanceM: distanceM / 2, deniveleM: denivelePosM },
    { distanceM: distanceM / 2, deniveleM: -deniveleNegM },
  ])
}
