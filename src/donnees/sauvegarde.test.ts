import { describe, expect, it } from 'vitest'
import type { Donnees } from '../domaine/modele'
import { ErreurSauvegarde, donneesVides, exporter, importer } from './sauvegarde'

const donnees: Donnees = {
  profil: { id: 'moi', version: 2, prenom: 'Léa', anneeNaissance: 1992, anneesPratique: 3, volumeHebdoKm: 30, joursDisponibles: [1, 3, 6], blessures: '', niveau: 2, blessureRecente: false, alerteSante: false, materiel: { gps: true, cardio: false }, terrains: { piste: false, cotes: true, chemins: true } },
  evaluations: [{ id: 'e1', version: 2, date: '2026-11-01', type: 'course', distanceM: 5000, dureeS: 1200, vdot: 49.8, vmaKmh: 16.5, fiabilite: 'bonne', note: '' }],
  objectifs: [],
  plans: [],
  activites: [{ id: 'a1', version: 1, date: '2026-11-10', source: 'manuel', distanceM: 8000, dureeS: 2880, tours: [], commentaire: 'Bien', rpe: 3 }],
}

describe('sauvegarde', () => {
  it('exporte puis réimporte à l’identique', () => {
    expect(importer(exporter(donnees, '2026-11-16'))).toEqual(donnees)
    expect(importer(exporter(donneesVides(), '2026-11-16'))).toEqual(donneesVides())
  })
  it('refuse ce qui n’est pas une sauvegarde', () => {
    expect(() => importer('pas du json')).toThrow(ErreurSauvegarde)
    expect(() => importer('{"format":"autre"}')).toThrow(ErreurSauvegarde)
    expect(() => importer('null')).toThrow(ErreurSauvegarde)
  })
  it('refuse une sauvegarde d’une version plus récente', () => {
    const futur = JSON.stringify({ format: 'coach-course', version: 99, donnees: donneesVides() })
    expect(() => importer(futur)).toThrow(/plus récente/)
  })
  it('refuse une sauvegarde tronquée ou abîmée', () => {
    const sansActivites = JSON.stringify({ format: 'coach-course', version: 1, donnees: { profil: null, evaluations: [], objectifs: [], plans: [] } })
    expect(() => importer(sansActivites)).toThrow(/activites/)
    const mauvaisProfil = JSON.stringify({ format: 'coach-course', version: 1, donnees: { ...donneesVides(), profil: { id: 'autre' } } })
    expect(() => importer(mauvaisProfil)).toThrow(/profil/)
    const sansId = JSON.stringify({ format: 'coach-course', version: 1, donnees: { ...donneesVides(), plans: [{}] } })
    expect(() => importer(sansId)).toThrow(/plans/)
  })
})
