import { describe, expect, it } from 'vitest'
import type { Activite, Objectif, Profil } from './modele'
import { genererPlan } from './plan'
import { diagnostiquer, reajuster } from './reajustement'

const profil: Profil = {
  id: 'moi',
  version: 2,
  prenom: '',
  anneeNaissance: 1990,
  anneesPratique: 5,
  volumeHebdoKm: 40,
  joursDisponibles: [1, 3, 5, 6],
  blessures: '',
  niveau: 2,
  blessureRecente: false,
  alerteSante: false,
  materiel: { gps: true, cardio: false },
  terrains: { piste: true, cotes: true, chemins: true },
}
const objectif: Objectif = { id: 'o', version: 2, type: 'route', nom: '10 km', distanceM: 10000, date: '2027-02-07' }
const plan = genererPlan({ id: 'p1', profil, objectif, vdot: 45, dateDepart: '2026-11-16' })

// Lundi de la 3e semaine : 8 séances prévues dans les 14 jours précédents.
const JOUR = '2026-11-30'
const prevues = plan.semaines.slice(0, 2).flatMap((s) => s.seances)

let n = 0
/** Activité qui réalise une séance prévue, avec un écart de ressenti donné. */
function faite(i: number, ecartRpe = 0, avecRpe = true): Activite {
  const s = prevues[i]
  return {
    id: `a${n++}`,
    version: 2,
    date: s.date,
    source: 'manuel',
    distanceM: s.distanceKm * 1000,
    dureeS: s.dureeMin * 60,
    tours: [],
    commentaire: '',
    seanceId: s.id,
    ...(avecRpe ? { rpe: s.rpeVise + ecartRpe } : {}),
  }
}
const toutes = (ecart = 0) => prevues.map((_, i) => faite(i, ecart))

describe('diagnostic', () => {
  it('ne change rien quand le plan est suivi et ressenti comme prévu', () => {
    const d = diagnostiquer(plan, toutes(), JOUR)
    expect(d).toEqual({ facteurVolume: 1, semaineAllegee: false, raisons: [], conseils: [], necessaire: false })
  })
  it('tolère une séance manquée', () => {
    expect(diagnostiquer(plan, toutes().slice(1), JOUR).necessaire).toBe(false)
  })
  it('ne juge pas un plan qui vient de commencer', () => {
    expect(diagnostiquer(plan, [], '2026-11-17').necessaire).toBe(false)
  })
  it('réduit de 10 % quand la moitié des séances a sauté', () => {
    const d = diagnostiquer(plan, [faite(0), faite(2), faite(4), faite(6)], JOUR)
    expect(d.facteurVolume).toBe(0.9)
    expect(d.semaineAllegee).toBe(false)
    expect(d.raisons[0]).toContain('4 séances manquées sur 8')
  })
  it('repart à 85 % après une semaine sans courir', () => {
    const d = diagnostiquer(plan, [faite(0), faite(1), faite(2), faite(3)], JOUR)
    expect(d.facteurVolume).toBe(0.85)
  })
  it('repart à 70 % après deux semaines sans courir (Mujika & Padilla, 2000)', () => {
    const d = diagnostiquer(plan, [], JOUR)
    expect(d.facteurVolume).toBe(0.7)
    expect(d.necessaire).toBe(true)
  })
  it('compte une sortie du même jour, même non rattachée au plan', () => {
    const libres = toutes().map((a) => ({ ...a, seanceId: undefined }) as Activite)
    expect(diagnostiquer(plan, libres, JOUR).necessaire).toBe(false)
  })
  it('allège après deux séances ressenties 2 points plus dures que prévu', () => {
    const activites = toutes()
    activites[1] = faite(1, 2)
    activites[5] = faite(5, 3)
    const d = diagnostiquer(plan, activites, JOUR)
    expect(d.semaineAllegee).toBe(true)
    expect(d.facteurVolume).toBe(0.85)
    expect(d.raisons[0]).toContain('2 séances')
  })
  it('ne réagit pas à une seule séance dure, ni à un écart d’un point', () => {
    const une = toutes()
    une[1] = faite(1, 3)
    expect(diagnostiquer(plan, une, JOUR).necessaire).toBe(false)
    expect(diagnostiquer(plan, toutes(1), JOUR).necessaire).toBe(false)
  })
  it('cumule séances manquées et fatigue', () => {
    const d = diagnostiquer(plan, [faite(0, 2), faite(2, 2), faite(4), faite(6)], JOUR)
    expect(d.facteurVolume).toBe(0.77) // 0,9 × 0,85
    expect(d.raisons).toHaveLength(2)
  })
  it('conseille une évaluation, sans toucher au plan, quand tout paraît facile', () => {
    const d = diagnostiquer(plan, toutes(-2), JOUR)
    expect(d.necessaire).toBe(false)
    expect(d.conseils[0]).toContain('évaluation')
  })
  it('ignore les séances sans ressenti', () => {
    expect(diagnostiquer(plan, prevues.map((_, i) => faite(i, 0, false)), JOUR).necessaire).toBe(false)
  })
})

describe('réajustement', () => {
  const base = { id: 'p2', plan, profil, objectif, vdot: 45, jour: JOUR }

  it('conserve les semaines passées et renumérote la suite', () => {
    const nouveau = reajuster({ ...base, activites: toutes() })
    expect(nouveau.semaines).toHaveLength(12)
    expect(nouveau.semaines.slice(0, 2)).toEqual(plan.semaines.slice(0, 2))
    expect(nouveau.semaines.map((s) => s.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(nouveau.semaines.at(-1)!.seances.at(-1)!.type).toBe('course')
    const ids = nouveau.semaines.flatMap((s) => s.seances).map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ne repart jamais plus haut que le volume prévu', () => {
    const nouveau = reajuster({ ...base, activites: toutes() })
    expect(nouveau.semaines[2].volumeKm).toBeLessThanOrEqual(plan.semaines[2].volumeKm + 0.5)
    expect(nouveau.ajustements[0]).toContain('à votre demande')
  })

  it('repart plus bas et par une semaine allégée après de la fatigue', () => {
    const activites = toutes()
    activites[1] = faite(1, 2)
    activites[5] = faite(5, 2)
    const nouveau = reajuster({ ...base, activites })
    expect(nouveau.semaines[2].allegee).toBe(true)
    expect(nouveau.semaines[2].volumeKm).toBeLessThan(plan.semaines[2].volumeKm * 0.75)
    expect(nouveau.semaines[3].allegee).toBe(false)
    expect(nouveau.ajustements[0]).toContain('semaine allégée')
  })

  it('repart d’après le volume réellement couru après une coupure', () => {
    // Rien couru : pas d'historique, on applique 70 % au volume prévu.
    const nouveau = reajuster({ ...base, activites: [] })
    expect(nouveau.semaines[2].volumeKm).toBeLessThan(plan.semaines[2].volumeKm * 0.8)
    expect(nouveau.ajustements[0]).toContain('70 %')
  })

  it('en milieu de semaine, garde les jours déjà passés de l’ancien plan', () => {
    const jeudi = '2026-12-03'
    const nouveau = reajuster({ ...base, jour: jeudi, activites: toutes() })
    const semaine = nouveau.semaines[2]
    const mardi = plan.semaines[2].seances[0]
    expect(semaine.seances[0]).toEqual(mardi)
    expect(semaine.seances.filter((s) => s.date >= jeudi).every((s) => s.id.startsWith('p2-'))).toBe(true)
  })

  it('limite la remontée à 10 % au-dessus du volume réellement couru', () => {
    // Le coureur n'a fait que des demi-séances pendant deux semaines.
    const moitie = prevues.map((_, i) => ({ ...faite(i), distanceM: prevues[i].distanceKm * 500, dureeS: prevues[i].dureeMin * 30 }))
    const nouveau = reajuster({ ...base, activites: moitie })
    const couru = (plan.semaines[0].volumeKm + plan.semaines[1].volumeKm) / 4
    expect(nouveau.semaines[2].volumeKm).toBeLessThanOrEqual(couru * 1.1 + 1.5)
  })
})
