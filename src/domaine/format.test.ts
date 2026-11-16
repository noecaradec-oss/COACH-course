import { describe, expect, it } from 'vitest'
import { ajouterJours, formaterDate, jourSemaine, joursEntre, lundiDe } from './dates'
import { formaterAllure, formaterDistance, formaterDuree, lireDuree } from './format'

describe('durées et allures', () => {
  it('met en forme les durées', () => {
    expect(formaterDuree(245)).toBe('4:05')
    expect(formaterDuree(3725)).toBe('1:02:05')
    expect(formaterDuree(59.6)).toBe('1:00')
    expect(formaterAllure(255)).toBe('4:15/km')
  })
  it('lit les durées saisies', () => {
    expect(lireDuree('20:00')).toBe(1200)
    expect(lireDuree('1:31:35')).toBe(5495)
    expect(lireDuree('1h31')).toBe(5460)
    expect(lireDuree('45')).toBe(2700)
    expect(lireDuree('abc')).toBeNull()
    expect(lireDuree('')).toBeNull()
  })
  it('met en forme les distances', () => {
    expect(formaterDistance(800)).toBe('800 m')
    expect(formaterDistance(5000)).toBe('5,00 km')
    expect(formaterDistance(21097)).toBe('21,1 km')
  })
})

describe('dates', () => {
  it('connaît les jours de la semaine (0 = lundi)', () => {
    expect(jourSemaine('2026-11-16')).toBe(0)
    expect(jourSemaine('2026-11-22')).toBe(6)
    expect(lundiDe('2026-11-19')).toBe('2026-11-16')
  })
  it('ajoute des jours sans glisser au changement d’heure', () => {
    expect(ajouterJours('2026-03-28', 2)).toBe('2026-03-30')
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01')
    expect(joursEntre('2026-10-24', '2026-10-26')).toBe(2)
  })
  it('écrit les dates en français', () => {
    expect(formaterDate('2026-11-16')).toBe('lundi 16 nov.')
  })
})
