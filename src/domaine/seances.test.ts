import { describe, expect, it } from 'vitest'
import { mesurerBlocs } from './plan'
import { SEANCES, TYPES_FICHE, VDOT_REFERENCE, blocsDe, fichesPour } from './seances'
import { calculerAllures } from './vdot'

const ALLURES_CONNUES = ['E', 'M', 'T', 'I', 'R', 'marche', 'aisance', 'exercice']

describe('base de séances', () => {
  it('contient au moins 150 séances', () => {
    expect(SEANCES.length).toBeGreaterThanOrEqual(150)
  })

  it('n’a aucun doublon : ni identifiant, ni titre, ni contenu', () => {
    const uniques = (valeurs: string[]) => new Set(valeurs).size
    expect(uniques(SEANCES.map((s) => s.id))).toBe(SEANCES.length)
    expect(uniques(SEANCES.map((s) => `${s.niveau}|${s.titre}`))).toBe(SEANCES.length)
    // Deux fiches ne doivent pas avoir le même contenu au même niveau.
    expect(uniques(SEANCES.map((s) => JSON.stringify([s.type, s.niveau, s.echauffement, s.corps, s.retourAuCalme])))).toBe(SEANCES.length)
  })

  it('couvre chaque type sur les 3 niveaux', () => {
    for (const type of TYPES_FICHE) {
      for (const niveau of [1, 2, 3] as const) {
        expect(SEANCES.filter((s) => s.type === type && s.niveau === niveau).length, `${type} niveau ${niveau}`).toBeGreaterThanOrEqual(3)
      }
    }
    expect(new Set(SEANCES.map((s) => s.type))).toEqual(new Set(TYPES_FICHE))
  })

  it('cite une source datée pour chaque type, ou dit qu’il n’y en a pas', () => {
    for (const s of SEANCES) expect(s.source, s.id).toMatch(/\d{4}|Pratique d’entraîneur/)
    // Un type = une source.
    for (const type of TYPES_FICHE) expect(new Set(SEANCES.filter((s) => s.type === type).map((s) => s.source)).size).toBe(1)
  })

  it('remplit toutes les rubriques de chaque fiche', () => {
    for (const s of SEANCES) {
      expect(s.titre.length, s.id).toBeGreaterThan(5)
      expect(s.objectif.length, s.id).toBeGreaterThan(15)
      expect(s.corps.length, s.id).toBeGreaterThan(0)
      expect(s.rpeVise, s.id).toBeGreaterThanOrEqual(1)
      expect(s.rpeVise, s.id).toBeLessThanOrEqual(10)
      expect(s.variantes.plusFacile.length, s.id).toBeGreaterThan(5)
      expect(s.variantes.plusDure.length, s.id).toBeGreaterThan(5)
      expect(s.phases.length, s.id).toBeGreaterThan(0)
      expect(['facile', 'seuil', 'intense'], s.id).toContain(s.categorie)
    }
  })

  it('n’a que des blocs bien formés', () => {
    for (const s of SEANCES) {
      for (const b of blocsDe(s)) {
        expect(ALLURES_CONNUES, s.id).toContain(b.allure)
        expect(b.repetitions, s.id).toBeGreaterThanOrEqual(1)
        // Durée ou distance, jamais les deux, jamais aucune.
        expect((b.dureeS !== undefined) !== (b.distanceM !== undefined), s.id).toBe(true)
        if (b.allure === 'exercice') expect(b.libelle, s.id).toBeTruthy()
        else expect(b.zone, s.id).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('accorde le ressenti visé à l’intensité', () => {
    for (const s of SEANCES) {
      if (s.type === 'recuperation') expect(s.rpeVise, s.id).toBeLessThanOrEqual(2)
      if (s.type === 'endurance') expect(s.rpeVise, s.id).toBeLessThanOrEqual(4)
      if (s.type === 'vmaLongue' || s.type === 'vmaCourte') expect(s.rpeVise, s.id).toBeGreaterThanOrEqual(8)
      if (s.categorie === 'seuil') expect(s.rpeVise, s.id).toBeGreaterThanOrEqual(5)
    }
  })

  it('annonce des durées cohérentes avec les allures du coureur type', () => {
    for (const s of SEANCES) {
      const { dureeMin } = mesurerBlocs(blocsDe(s), calculerAllures(VDOT_REFERENCE[s.niveau]))
      expect(Math.abs(dureeMin - s.dureeMin), s.id).toBeLessThanOrEqual(1)
    }
  })

  it('respecte les plafonds de Daniels (2014) par répétition', () => {
    for (const s of SEANCES) {
      for (const b of s.corps) {
        // Allure I : 5 min au plus par effort. Allure R : 2 min au plus.
        if (b.allure === 'I' && b.dureeS) expect(b.dureeS, s.id).toBeLessThanOrEqual(300)
        if (b.allure === 'R' && b.dureeS) expect(b.dureeS, s.id).toBeLessThanOrEqual(120)
      }
    }
  })

  it('annonce dans le titre la durée totale des footings et sorties longues', () => {
    for (const s of SEANCES.filter((x) => x.type === 'endurance' || x.type === 'sortieLongue')) {
      const annonce = Number(/(\d+) min/.exec(s.titre)?.[1])
      expect(Math.abs(annonce - s.dureeMin), s.id).toBeLessThanOrEqual(2)
    }
  })

  it('garde les sorties longues sous 150 min', () => {
    for (const s of SEANCES.filter((x) => x.type === 'sortieLongue')) {
      expect(s.dureeMin, s.id).toBeLessThanOrEqual(150)
      if (s.ajustable) expect(s.ajustable.maxMin).toBeLessThanOrEqual(150)
    }
  })

  it('propose une fiche à durée réglable en endurance et en sortie longue, à chaque niveau', () => {
    for (const type of ['endurance', 'sortieLongue'] as const) {
      for (const niveau of [1, 2, 3] as const) {
        expect(SEANCES.some((s) => s.type === type && s.niveau === niveau && s.ajustable), `${type} ${niveau}`).toBe(true)
      }
    }
  })
})

describe('sélection des fiches', () => {
  it('filtre par type, niveau et cible', () => {
    const fiches = fichesPour({ type: 'allureSpecifique', niveau: 3, cible: 'semi' })
    expect(fiches.length).toBeGreaterThan(0)
    expect(fiches.every((f) => f.type === 'allureSpecifique' && f.niveau === 3)).toBe(true)
    expect(fiches.some((f) => f.titre.includes('16 km'))).toBe(false) // réservée au marathon
  })
  it('écarte les séances sur piste quand le coureur n’en a pas', () => {
    expect(fichesPour({ type: 'vmaLongue', niveau: 2, piste: false }).every((f) => f.terrain !== 'piste')).toBe(true)
  })
  it('propose quand même quelque chose si les filtres ne laissent rien', () => {
    // Toutes les séances de vitesse de niveau 3 se font sur piste.
    expect(fichesPour({ type: 'vitesse', niveau: 3, piste: false }).length).toBeGreaterThan(0)
  })
})
