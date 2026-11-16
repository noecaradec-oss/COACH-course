// Placement des séances dans la semaine.

function ecartCirculaire(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 7 - d)
}

/**
 * Répartit les séances dures sur les jours disponibles en les éloignant le
 * plus possible les unes des autres et des jours déjà pris (alternance dur /
 * facile : principe d'entraîneur classique, attribué à Bowerman ; pas de
 * source expérimentale). On essaie toutes les combinaisons : il y a 7 jours
 * au plus. À égalité, on garde les jours les plus tôt dans la semaine.
 */
export function placerJoursDurs(joursDisponibles: number[], nbDurs: number, dejaPris: number[] = []): number[] {
  const libres = joursDisponibles.filter((j) => !dejaPris.includes(j)).sort((a, b) => a - b)
  const nb = Math.min(nbDurs, libres.length)
  if (nb === 0) return []
  let meilleur: number[] = []
  let meilleurScore = [-1, -1]
  const essayer = (choisis: number[], depuis: number) => {
    if (choisis.length === nb) {
      const tous = [...dejaPris, ...choisis]
      let ecartMin = 7
      let somme = 0
      for (let i = 0; i < tous.length; i++) {
        for (let j = i + 1; j < tous.length; j++) {
          const e = ecartCirculaire(tous[i], tous[j])
          ecartMin = Math.min(ecartMin, e)
          somme += e
        }
      }
      if (ecartMin > meilleurScore[0] || (ecartMin === meilleurScore[0] && somme > meilleurScore[1])) {
        meilleur = choisis
        meilleurScore = [ecartMin, somme]
      }
      return
    }
    for (let i = depuis; i < libres.length; i++) essayer([...choisis, libres[i]], i + 1)
  }
  essayer([], 0)
  return meilleur
}
