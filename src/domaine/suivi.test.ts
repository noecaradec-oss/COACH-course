import { describe, expect, it } from 'vitest'
import { evaluationCourante, evaluer } from './evaluation'
import type { Activite, Plan, SeancePrevue } from './modele'
import { bilansHebdo, calculerAlertes, categorieActivite, repartitionRecente, seanceDuJour, volumeRecentKm } from './suivi'

let n = 0
function activite(date: string, km: number, min: number, rpe?: number, seanceId?: string): Activite {
  return { id: `a${n++}`, version: 1, date, source: 'manuel', distanceM: km * 1000, dureeS: min * 60, tours: [], commentaire: '', ...(rpe !== undefined ? { rpe } : {}), ...(seanceId ? { seanceId } : {}) }
}

function seance(id: string, date: string, categorie: SeancePrevue['categorie']): SeancePrevue {
  return { id, date, type: 'footing', titre: 'x', categorie, blocs: [], distanceKm: 10, dureeMin: 60, consigne: '' }
}

const plan: Plan = {
  id: 'p',
  version: 1,
  objectifId: 'o',
  creeLe: '2026-11-02',
  semaines: [
    { numero: 1, debut: '2026-11-09', phase: 'base', allegee: false, volumeKm: 30, seances: [seance('s1', '2026-11-10', 'facile'), seance('s2', '2026-11-12', 'intense'), seance('s3', '2026-11-14', 'facile')] },
    { numero: 2, debut: '2026-11-16', phase: 'base', allegee: false, volumeKm: 32, seances: [seance('s4', '2026-11-16', 'facile')] },
  ],
  avertissements: [],
}

const JOUR = '2026-11-18' // mercredi

describe('évaluation', () => {
  it('convertit une course en VDOT et VMA', () => {
    const e = evaluer({ type: 'course', distanceM: 5000, dureeS: 1200 }, '2026-11-01', 'e1')
    expect(e.vdot).toBe(49.8)
    expect(e.vmaKmh).toBeCloseTo(16.5, 1)
  })
  it('demi-Cooper : la VMA est la vitesse moyenne des 6 minutes', () => {
    // 1500 m en 6 min = 15 km/h
    const e = evaluer({ type: 'demiCooper', distanceM: 1500 }, '2026-11-01', 'e2')
    expect(e.vmaKmh).toBe(15)
    expect(e.dureeS).toBe(360)
  })
  it('VAMEVAL : la VMA est la vitesse du dernier palier', () => {
    const e = evaluer({ type: 'vameval', vitessePalierKmh: 14.5 }, '2026-11-01', 'e3')
    expect(e.vmaKmh).toBe(14.5)
    expect(e.distanceM).toBe(1450)
  })
  it('retient l’évaluation la plus récente, pas la meilleure', () => {
    const ancienne = evaluer({ type: 'course', distanceM: 5000, dureeS: 1100 }, '2025-05-01', 'a')
    const recente = evaluer({ type: 'course', distanceM: 5000, dureeS: 1250 }, '2026-10-01', 'b')
    expect(evaluationCourante([ancienne, recente])?.id).toBe('b')
    expect(evaluationCourante([])).toBeNull()
  })
})

describe('bilans hebdomadaires', () => {
  const activites = [
    activite('2026-11-10', 8, 48, 3, 's1'),
    activite('2026-11-12', 9, 50, 7, 's2'),
    activite('2026-11-14', 12, 72, 4, 's3'),
    activite('2026-11-16', 8, 48, 3, 's4'),
  ]
  const [precedente, courante] = bilansHebdo(activites, plan, JOUR, 2)
  it('additionne distance, durée et charge', () => {
    expect(precedente.km).toBe(29)
    expect(precedente.dureeMin).toBe(170)
    expect(precedente.nbSeances).toBe(3)
    expect(precedente.charge).toBe(3 * 48 + 7 * 50 + 4 * 72) // 782
    expect(precedente.kmPrevus).toBe(30)
  })
  it('calcule la monotonie de la semaine terminée seulement', () => {
    // charges : 0, 144, 0, 350, 0, 288, 0 → moyenne 111,71 ; écart-type 140,82 → 0,793
    expect(precedente.monotonie).toBeCloseTo(0.793, 3)
    expect(courante.monotonie).toBeNull()
  })
  it('ne calcule pas de charge sans ressenti', () => {
    const [b] = bilansHebdo([activite('2026-11-17', 5, 30)], null, JOUR, 1)
    expect(b.charge).toBeNull()
    expect(b.kmPrevus).toBeNull()
  })
})

describe('séance du jour et catégories', () => {
  it('propose la séance prévue tant qu’elle n’est pas faite', () => {
    expect(seanceDuJour(plan, '2026-11-16', [])?.id).toBe('s4')
    expect(seanceDuJour(plan, '2026-11-16', [activite('2026-11-16', 8, 48, 3, 's4')])).toBeNull()
    expect(seanceDuJour(plan, '2026-11-17', [])).toBeNull()
    expect(seanceDuJour(null, '2026-11-16', [])).toBeNull()
  })
  it('classe par la séance prévue, sinon par le ressenti (Seiler & Kjerland, 2006)', () => {
    const seances = new Map(plan.semaines.flatMap((s) => s.seances).map((s) => [s.id, s]))
    expect(categorieActivite(activite('2026-11-12', 9, 50, 3, 's2'), seances)).toBe('intense')
    expect(categorieActivite(activite('2026-11-12', 9, 50, 4), seances)).toBe('facile')
    expect(categorieActivite(activite('2026-11-12', 9, 50, 6), seances)).toBe('seuil')
    expect(categorieActivite(activite('2026-11-12', 9, 50, 7), seances)).toBe('intense')
    expect(categorieActivite(activite('2026-11-12', 9, 50), seances)).toBeNull()
  })
  it('ne compte que les 28 derniers jours', () => {
    const r = repartitionRecente([activite('2026-10-01', 5, 30, 8), activite('2026-11-10', 5, 30, 3), activite('2026-11-17', 5, 30, 8)], null, JOUR)
    expect(r).toEqual({ facile: 1, seuil: 0, intense: 1, total: 2 })
  })
})

describe('alertes', () => {
  it('reste silencieux quand tout va bien', () => {
    expect(calculerAlertes([activite('2026-11-03', 10, 60, 3), activite('2026-11-10', 10, 60, 3), activite('2026-11-12', 2, 12, 3)], plan, JOUR)).toEqual([])
    expect(calculerAlertes([], null, JOUR)).toEqual([])
  })
  it('signale une hausse de plus de 30 % (Nielsen, 2014)', () => {
    const alertes = calculerAlertes([activite('2026-11-03', 20, 120), activite('2026-11-10', 30, 180)], null, JOUR)
    expect(alertes).toHaveLength(1)
    expect(alertes[0].detail).toContain('+50 %')
  })
  it('signale une semaine monotone (Foster, 1998)', () => {
    // Sept jours presque identiques la semaine du 9 au 15.
    const semaine = ['09', '10', '11', '12', '13', '14', '15'].map((j, i) => activite(`2026-11-${j}`, 8, 48, i === 0 ? 4 : 3))
    const precedente = ['02', '03', '04', '05', '06', '07', '08'].map((j) => activite(`2026-11-${j}`, 8, 48, 3))
    const titres = calculerAlertes([...precedente, ...semaine], null, JOUR).map((a) => a.titre)
    expect(titres).toContain('Semaine trop uniforme')
  })
  it('signale un manque de séances faciles (Seiler & Kjerland, 2006)', () => {
    const dures = ['01', '03', '05', '07', '09', '11', '13', '15'].map((j, i) => activite(`2026-11-${j}`, 8, 48, i < 4 ? 8 : 3))
    const titres = calculerAlertes(dures, null, JOUR).map((a) => a.titre)
    expect(titres).toContain('Trop peu de séances faciles')
  })
  it('signale des footings ressentis trop durs', () => {
    const alertes = calculerAlertes([activite('2026-11-10', 8, 48, 7, 's1'), activite('2026-11-14', 8, 48, 6, 's3')], plan, JOUR)
    expect(alertes.map((a) => a.titre)).toContain('Vos footings vous coûtent trop')
  })
})

describe('volume récent', () => {
  it('fait la moyenne des semaines terminées où le coureur a couru', () => {
    // Semaines du 26/10 (20 km), du 2/11 (vide) et du 9/11 (30 km) ; la semaine en cours ne compte pas.
    const activites = [activite('2026-10-27', 20, 120), activite('2026-11-10', 30, 180), activite('2026-11-17', 50, 300)]
    expect(volumeRecentKm(activites, JOUR)).toBe(25)
    expect(volumeRecentKm([], JOUR)).toBeNull()
  })
})
