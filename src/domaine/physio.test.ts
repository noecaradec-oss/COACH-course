import { describe, expect, it } from 'vitest'
import {
  chargeSeance,
  contrainte,
  hausseTropRapide,
  monotonie,
  repartirIntensites,
  trimp,
  tropPeuDeFacile,
  variationHebdo,
} from './charge'
import { coutCourse, distanceEquivalenteApprochee, distanceEquivalentePlat } from './denivele'
import { fcMaxEstimee, fractionReserve, indiceZone, zonesFc } from './fc'

describe('fréquence cardiaque', () => {
  it('estime la FC max (Tanaka, 2001)', () => {
    expect(fcMaxEstimee(40)).toBe(180) // 208 − 28
    expect(fcMaxEstimee(25)).toBe(191) // 208 − 17,5 = 190,5
  })
  it('calcule la fraction de réserve (Karvonen, 1957)', () => {
    expect(fractionReserve(150, 50, 200)).toBeCloseTo(2 / 3, 6)
    expect(fractionReserve(40, 50, 200)).toBe(0)
    expect(fractionReserve(210, 50, 200)).toBe(1)
    expect(() => fractionReserve(150, 200, 200)).toThrow()
  })
  it('découpe 5 zones en % de FC max (Seiler, 2010)', () => {
    expect(zonesFc(200).map((z) => [z.min, z.max])).toEqual([
      [110, 150],
      [150, 170],
      [170, 180],
      [180, 190],
      [190, 200],
    ])
  })
  it('range une FC dans sa zone', () => {
    expect(indiceZone(100, 200)).toBe(0)
    expect(indiceZone(149, 200)).toBe(0)
    expect(indiceZone(150, 200)).toBe(1)
    expect(indiceZone(175, 200)).toBe(2)
    expect(indiceZone(200, 200)).toBe(4)
  })
})

describe('charge (Foster, 1998 et 2001)', () => {
  const semaine = [300, 0, 300, 0, 300, 0, 300]
  it('charge = RPE × minutes', () => {
    expect(chargeSeance(5, 60)).toBe(300)
  })
  it('calcule la monotonie', () => {
    // moyenne 171,43 ; écart-type 148,46 → 1,155
    expect(monotonie(semaine)).toBeCloseTo(1.1547, 3)
  })
  it('calcule la contrainte', () => {
    expect(contrainte(semaine)).toBeCloseTo(1385.6, 0)
  })
  it('ne divise pas par zéro quand tous les jours se ressemblent', () => {
    expect(monotonie([100, 100, 100, 100, 100, 100, 100])).toBeNull()
    expect(contrainte([0, 0, 0, 0, 0, 0, 0])).toBeNull()
  })
  it('exige 7 jours', () => {
    expect(() => monotonie([1, 2, 3])).toThrow()
  })
})

describe('TRIMP (Banister, 1991)', () => {
  it('homme, 30 min à 56 % de réserve', () => {
    // 30 × 0,56 × 0,64 × e^(1,92 × 0,56) = 31,5
    expect(trimp(30, 0.56, 'homme')).toBeCloseTo(31.5, 1)
  })
  it('femme, 60 min à 70 % de réserve', () => {
    // 60 × 0,7 × 0,86 × e^(1,67 × 0,7) = 116,3
    expect(trimp(60, 0.7, 'femme')).toBeCloseTo(116.3, 1)
  })
})

describe('progression du kilométrage (Nielsen, 2014)', () => {
  it('alerte au-delà de +30 %', () => {
    expect(hausseTropRapide(30, 40)).toBe(true)
    expect(hausseTropRapide(30, 38)).toBe(false)
    expect(hausseTropRapide(30, 20)).toBe(false)
  })
  it('ne juge pas après une semaine vide', () => {
    expect(variationHebdo(0, 20)).toBeNull()
    expect(hausseTropRapide(0, 20)).toBe(false)
  })
})

describe('répartition des intensités (Seiler & Kjerland, 2006)', () => {
  it('compte les séances par catégorie', () => {
    expect(repartirIntensites(['facile', 'facile', 'seuil', 'intense'])).toEqual({
      facile: 2,
      seuil: 1,
      intense: 1,
      total: 4,
    })
  })
  it('alerte sous 75 % de facile, à partir de 8 séances', () => {
    expect(tropPeuDeFacile({ facile: 5, seuil: 2, intense: 3, total: 10 })).toBe(true)
    expect(tropPeuDeFacile({ facile: 8, seuil: 1, intense: 1, total: 10 })).toBe(false)
    expect(tropPeuDeFacile({ facile: 1, seuil: 1, intense: 1, total: 3 })).toBe(false)
  })
})

describe('dénivelé (Minetti, 2002)', () => {
  it('coût à plat et sur pente de ±10 %', () => {
    expect(coutCourse(0)).toBeCloseTo(3.6, 6)
    // 0,001554 − 0,00304 − 0,0433 + 0,463 + 1,95 + 3,6 = 5,9682
    expect(coutCourse(0.1)).toBeCloseTo(5.9682, 3)
    // −0,001554 − 0,00304 + 0,0433 + 0,463 − 1,95 + 3,6 = 2,1517
    expect(coutCourse(-0.1)).toBeCloseTo(2.1517, 3)
  })
  it('borne la pente au domaine mesuré (±45 %)', () => {
    expect(coutCourse(0.8)).toBe(coutCourse(0.45))
    expect(coutCourse(-0.8)).toBe(coutCourse(-0.45))
  })
  it('convertit en distance à plat', () => {
    expect(distanceEquivalentePlat([{ distanceM: 1000, deniveleM: 0 }])).toBeCloseTo(1000, 6)
    // 1000 × 5,9682 / 3,6 = 1657,8
    expect(distanceEquivalentePlat([{ distanceM: 1000, deniveleM: 100 }])).toBeCloseTo(1657.8, 0)
    expect(distanceEquivalentePlat([{ distanceM: 0, deniveleM: 5 }])).toBe(0)
  })
  it('approche un parcours par une montée puis une descente', () => {
    // 2 km, 100 m D+ et D− : 1000 × (5,9682 + 2,1517) / 3,6 = 2255,5
    expect(distanceEquivalenteApprochee(2000, 100)).toBeCloseTo(2255.5, 0)
    expect(distanceEquivalenteApprochee(10000, 0)).toBeCloseTo(10000, 6)
  })
})
