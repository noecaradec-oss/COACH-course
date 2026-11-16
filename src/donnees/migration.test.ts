import { describe, expect, it } from 'vitest'
import type { Donnees } from '../domaine/modele'
import { migrer } from './migration'

// Données telles qu'enregistrées par la version 1 de l'appli.
const v1 = {
  profil: { id: 'moi', version: 1, prenom: 'Léa', anneeNaissance: 1992, anneesPratique: 4, volumeHebdoKm: 50, joursDisponibles: [1, 3, 6], blessures: '' },
  evaluations: [{ id: 'e1', version: 1, date: '2026-11-01', type: 'course', distanceM: 5000, dureeS: 1200, vdot: 49.8, vmaKmh: 16.5, note: '' }],
  objectifs: [{ id: 'o1', version: 1, type: 'route', nom: '10 km', distanceM: 10000, date: '2027-02-07' }],
  plans: [
    {
      id: 'p1',
      version: 1,
      objectifId: 'o1',
      creeLe: '2026-11-16',
      avertissements: [],
      semaines: [
        {
          numero: 1,
          debut: '2026-11-16',
          phase: 'base',
          allegee: false,
          volumeKm: 30,
          seances: [
            { id: 's1', date: '2026-11-17', type: 'footing', titre: 'Footing', categorie: 'facile', blocs: [], distanceKm: 8, dureeMin: 48, consigne: '' },
            { id: 's2', date: '2026-11-19', type: 'intervalles', titre: 'Intervalles', categorie: 'intense', blocs: [], distanceKm: 9, dureeMin: 50, consigne: '' },
            { id: 's3', date: '2026-11-21', type: 'seuil', titre: 'Seuil', categorie: 'seuil', blocs: [], distanceKm: 9, dureeMin: 50, consigne: '' },
          ],
        },
      ],
    },
  ],
  activites: [{ id: 'a1', version: 1, date: '2026-11-17', source: 'manuel', distanceM: 8000, dureeS: 2880, tours: [], commentaire: '', rpe: 3, seanceId: 's1' }],
} as unknown as Donnees

describe('passage des données de la version 1 à la version 2', () => {
  const v2 = migrer(v1)

  it('complète le profil sans rien perdre', () => {
    expect(v2.profil).toMatchObject({ prenom: 'Léa', volumeHebdoKm: 50, version: 2, niveau: 3, blessureRecente: false, alerteSante: false })
    expect(v2.profil!.terrains).toEqual({ piste: true, cotes: true, chemins: true })
  })
  it('donne une fiabilité aux évaluations existantes', () => {
    expect(v2.evaluations[0]).toMatchObject({ vdot: 49.8, fiabilite: 'bonne' })
  })
  it('aligne les types de séance sur la base et ajoute le ressenti visé', () => {
    const seances = v2.plans[0].semaines[0].seances
    expect(seances.map((s) => s.type)).toEqual(['endurance', 'vmaLongue', 'seuil'])
    expect(seances.map((s) => s.rpeVise)).toEqual([3, 8, 6])
    expect(seances.map((s) => s.id)).toEqual(['s1', 's2', 's3']) // les liens avec le journal tiennent
    expect(v2.plans[0].ajustements).toEqual([])
  })
  it('laisse intacts les objectifs et le journal', () => {
    expect(v2.objectifs).toEqual(v1.objectifs)
    expect(v2.activites).toEqual(v1.activites)
  })
  it('ne retouche pas des données déjà en version 2', () => {
    expect(migrer(v2)).toEqual(v2)
  })
  it('accepte une appli vide', () => {
    const vide = { profil: null, evaluations: [], objectifs: [], plans: [], activites: [] }
    expect(migrer(vide)).toEqual(vide)
  })
})
