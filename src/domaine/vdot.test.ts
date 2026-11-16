import { describe, expect, it } from 'vitest'
import { predireRiegel } from './prediction'
import {
  calculerAllures,
  calculerVdot,
  dureeDansDomaineValide,
  evaluerRealisme,
  fractionVo2max,
  predireTemps,
  vdotDepuisVma,
  vitesseDepuisVo2,
  vmaDepuisVdot,
  vo2DepuisVitesse,
} from './vdot'

describe('VDOT (Daniels & Gilbert, 1979)', () => {
  it('calcule le coût en oxygène à 250 m/min', () => {
    // −4,6 + 0,182258 × 250 + 0,000104 × 250² = 47,4645
    expect(vo2DepuisVitesse(250)).toBeCloseTo(47.4645, 4)
  })
  it('inverse le coût en oxygène', () => {
    expect(vitesseDepuisVo2(vo2DepuisVitesse(250))).toBeCloseTo(250, 6)
  })
  it('calcule la fraction soutenable sur 20 min', () => {
    // 0,8 + 0,1894393·e^(−0,25556) + 0,2989558·e^(−3,86521) = 0,9530
    expect(fractionVo2max(20)).toBeCloseTo(0.953, 3)
  })
  it('donne un VDOT proche de 50 pour 5 km en 20:00', () => {
    // 47,4645 / 0,9530 = 49,8
    expect(calculerVdot(5000, 1200)).toBeCloseTo(49.8, 1)
  })
  it('refuse les entrées absurdes', () => {
    expect(() => calculerVdot(0, 1200)).toThrow()
    expect(() => calculerVdot(5000, 0)).toThrow()
  })
  it('retrouve les temps de la table VDOT 50 de Daniels (2014)', () => {
    // Table (citée de mémoire) : 5 km 19:57, 10 km 41:21, semi 1:31:35, marathon 3:10:49.
    expect(Math.abs(predireTemps(50, 5000) - 1197)).toBeLessThan(5)
    expect(Math.abs(predireTemps(50, 10000) - 2481)).toBeLessThan(8)
    expect(Math.abs(predireTemps(50, 21097.5) - 5495)).toBeLessThan(15)
    expect(Math.abs(predireTemps(50, 42195) - 11449)).toBeLessThan(30)
  })
  it('prédiction et calcul sont inverses', () => {
    for (const vdot of [30, 45, 60, 75]) {
      expect(calculerVdot(10000, predireTemps(vdot, 10000))).toBeCloseTo(vdot, 6)
    }
  })
  it('signale les durées hors du domaine du modèle', () => {
    expect(dureeDansDomaineValide(1200)).toBe(true)
    expect(dureeDansDomaineValide(120)).toBe(false)
    expect(dureeDansDomaineValide(5 * 3600)).toBe(false)
  })
})

describe('allures (Daniels, 2014)', () => {
  const a = calculerAllures(50)
  it('retrouve les allures de la table VDOT 50 à 3 s/km près', () => {
    // Table (citée de mémoire) : M 4:31, T 4:15, I 3:55, R 3:38 (87 s au 400 m).
    expect(Math.abs(a.M - 271)).toBeLessThan(3)
    expect(Math.abs(a.T - 255)).toBeLessThan(3)
    expect(Math.abs(a.I - 235)).toBeLessThan(3)
    expect(Math.abs(a.R - 218)).toBeLessThan(3)
  })
  it('range les allures de la plus lente à la plus rapide', () => {
    expect(a.E.lente).toBeGreaterThan(a.E.rapide)
    expect(a.E.rapide).toBeGreaterThan(a.M)
    expect(a.M).toBeGreaterThan(a.T)
    expect(a.T).toBeGreaterThan(a.I)
    expect(a.I).toBeGreaterThan(a.R)
  })
})

describe('VMA', () => {
  it('estime la VMA comme la vitesse tenue 6 min', () => {
    // VDOT 50 : VO2 = 50 × 1,0693 = 53,46 → 275,4 m/min → 16,5 km/h
    expect(vmaDepuisVdot(50)).toBeCloseTo(16.5, 1)
  })
  it('VMA → VDOT → VMA redonne la même valeur', () => {
    expect(vmaDepuisVdot(vdotDepuisVma(14))).toBeCloseTo(14, 6)
  })
})

describe('réalisme de l’objectif', () => {
  it('classe l’écart de VDOT selon le temps disponible', () => {
    expect(evaluerRealisme(50, 49, 10)).toBe('acquis')
    expect(evaluerRealisme(50, 51.5, 10)).toBe('realiste') // gain raisonnable : 2 points
    expect(evaluerRealisme(50, 53, 10)).toBe('ambitieux')
    expect(evaluerRealisme(50, 56, 10)).toBe('peuRealiste')
  })
})

describe('Riegel (1981)', () => {
  it('prédit le semi à partir du 10 km', () => {
    // 2400 × (21097,5 / 10000)^1,06 = 5295 s
    expect(predireRiegel(10000, 2400, 21097.5)).toBeCloseTo(5295.4, 0)
  })
  it('redonne le même temps sur la même distance', () => {
    expect(predireRiegel(10000, 2400, 10000)).toBe(2400)
  })
})
