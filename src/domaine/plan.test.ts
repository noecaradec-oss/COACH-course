import { describe, expect, it } from 'vitest'
import { joursEntre, jourSemaine } from './dates'
import type { Objectif, Profil } from './modele'
import {
  calculerVolumes,
  decouperPhases,
  distanceEffort,
  etapeDebutant,
  genererPlan,
  mesurerBloc,
  nombreQualite,
  placerJoursDurs,
  plafondVolume,
} from './plan'
import { calculerAllures } from './vdot'

const profil: Profil = {
  id: 'moi',
  version: 1,
  prenom: 'Test',
  anneeNaissance: 1990,
  anneesPratique: 5,
  volumeHebdoKm: 40,
  joursDisponibles: [1, 3, 5, 6],
  blessures: '',
}

const dixKm: Objectif = { id: 'o1', version: 1, type: 'route', nom: '10 km', distanceM: 10000, date: '2027-02-07' }

describe('mesure d’un bloc', () => {
  const allures = calculerAllures(50)
  it('compte les récupérations entre les répétitions, pas après la dernière', () => {
    const m = mesurerBloc({ repetitions: 5, dureeS: 180, allure: 'I', recupS: 120, recupMode: 'trot' }, allures)
    expect(m.dureeS).toBe(5 * 180 + 4 * 120)
  })
  it('déduit la durée d’une distance', () => {
    const m = mesurerBloc({ repetitions: 1, distanceM: 10000, allure: 'T' }, allures)
    expect(m.dureeS).toBeCloseTo(10 * allures.T, 6)
    expect(m.distanceM).toBe(10000)
  })
  it('fonctionne sans niveau mesuré (débutant)', () => {
    // 60 s à 7:30/km = 133 m
    expect(mesurerBloc({ repetitions: 1, dureeS: 60, allure: 'aisance' }, null).distanceM).toBeCloseTo(133.3, 1)
  })
})

describe('phases', () => {
  it('12 semaines : 5 de base, 5 spécifiques, 2 d’affûtage', () => {
    const p = decouperPhases(12)
    expect(p.filter((x) => x === 'base')).toHaveLength(5) // 10 semaines hors affûtage, dont 45 % arrondis à 5
    expect(p.filter((x) => x === 'specifique')).toHaveLength(5)
    expect(p.filter((x) => x === 'affutage')).toHaveLength(2)
    expect(p[p.length - 1]).toBe('affutage')
  })
  it('préparation courte : un seul affûtage', () => {
    expect(decouperPhases(5)).toEqual(['base', 'base', 'specifique', 'specifique', 'affutage'])
    expect(decouperPhases(1)).toEqual(['affutage'])
  })
})

describe('volumes', () => {
  const phases = decouperPhases(12)
  const v = calculerVolumes(phases, 40, 70)
  it('part du volume actuel', () => {
    expect(v[0]).toEqual({ km: 40, allegee: false })
  })
  it('n’augmente jamais de plus de 8 % d’une semaine de charge à l’autre', () => {
    const charges = v.filter((_, i) => phases[i] !== 'affutage' && !v[i].allegee).map((x) => x.km)
    for (let i = 1; i < charges.length; i++) expect(charges[i] / charges[i - 1]).toBeLessThanOrEqual(1.1)
  })
  it('allège une semaine sur quatre', () => {
    expect(v.map((x) => x.allegee)).toEqual([false, false, false, true, false, false, false, true, false, false, false, false])
    expect(v[3].km).toBe(Math.round(40 * 1.08 * 1.08 * 0.75))
  })
  it('réduit le volume de 41 à 60 % en affûtage (Bosquet, 2007)', () => {
    const pic = Math.max(...v.map((x) => x.km))
    expect(v[10].km / pic).toBeGreaterThan(0.4)
    expect(v[10].km / pic).toBeLessThan(0.59)
    expect(v[11].km).toBeLessThan(v[10].km)
    expect(v[11].km / pic).toBeGreaterThanOrEqual(0.4)
  })
  it('respecte le plafond', () => {
    expect(Math.max(...calculerVolumes(decouperPhases(30), 40, 45).map((x) => x.km))).toBeLessThanOrEqual(45)
  })
  it('ne plafonne jamais sous le volume actuel', () => {
    expect(plafondVolume(5000, 3, 80)).toBe(80)
    expect(plafondVolume(5000, 3, 20)).toBe(42)
    expect(plafondVolume(42195, 7, 50)).toBe(98)
  })
})

describe('séances de qualité et placement', () => {
  it('limite la qualité selon le nombre de sorties (Seiler & Kjerland, 2006)', () => {
    expect(nombreQualite(1, 'specifique', 5)).toBe(0)
    expect(nombreQualite(2, 'base', 5)).toBe(0)
    expect(nombreQualite(4, 'specifique', 5)).toBe(1)
    expect(nombreQualite(6, 'base', 5)).toBe(1)
    expect(nombreQualite(6, 'specifique', 5)).toBe(2)
    expect(nombreQualite(6, 'specifique', 0)).toBe(1)
  })
  it('éloigne les séances dures les unes des autres', () => {
    // Sortie longue le dimanche (6) : la séance dure va au milieu de semaine.
    expect(placerJoursDurs([1, 3, 5, 6], 1, [6])).toEqual([3])
    // Mardi et jeudi : aucun jour dur collé à un autre.
    expect(placerJoursDurs([0, 1, 2, 3, 4, 5, 6], 2, [6])).toEqual([1, 3])
    expect(placerJoursDurs([0, 1, 2, 3, 5, 6], 2, [6])).toEqual([1, 3])
  })
  it('ne place pas plus de séances que de jours libres', () => {
    expect(placerJoursDurs([6], 2, [6])).toEqual([])
  })
})

describe('plan complet, 10 km en 12 semaines', () => {
  const plan = genererPlan({ id: 'p1', profil, objectif: dixKm, vdot: 45, dateDepart: '2026-11-16' })
  it('couvre du lundi de départ à la semaine de course', () => {
    expect(plan.semaines).toHaveLength(12)
    expect(plan.semaines[0].debut).toBe('2026-11-16')
    expect(plan.semaines[11].debut).toBe('2027-02-01')
  })
  it('se termine par la course, le bon jour', () => {
    const derniere = plan.semaines[11].seances.at(-1)!
    expect(derniere.type).toBe('course')
    expect(derniere.date).toBe('2027-02-07')
    expect(derniere.distanceKm).toBe(10)
  })
  it('ne place les séances que sur les jours disponibles', () => {
    for (const s of plan.semaines.flatMap((x) => x.seances)) {
      if (s.type !== 'course') expect(profil.joursDisponibles).toContain(jourSemaine(s.date))
    }
  })
  it('donne 4 séances par semaine hors semaine de course', () => {
    for (const semaine of plan.semaines.slice(0, 11)) expect(semaine.seances).toHaveLength(4)
  })
  it('garde au moins 65 % de séances faciles', () => {
    const toutes = plan.semaines.flatMap((x) => x.seances)
    expect(toutes.filter((s) => s.categorie === 'facile').length / toutes.length).toBeGreaterThanOrEqual(0.65)
  })
  it('ne dépasse jamais le volume prévu de plus de 15 %', () => {
    const volumes = calculerVolumes(decouperPhases(12), 40, plafondVolume(10000, 4, 40))
    plan.semaines.slice(0, 11).forEach((s, i) => {
      expect(s.volumeKm).toBeLessThan(volumes[i].km * 1.15)
      expect(s.volumeKm).toBeGreaterThan(volumes[i].km * 0.75)
    })
  })
  it('garde la sortie longue sous 150 min et plus longue que les footings', () => {
    for (const semaine of plan.semaines.slice(0, 10)) {
      const longue = semaine.seances.find((s) => s.type === 'sortieLongue')!
      expect(longue.dureeMin).toBeLessThanOrEqual(150)
      for (const f of semaine.seances.filter((s) => s.type === 'footing')) {
        expect(longue.distanceKm).toBeGreaterThan(f.distanceKm)
      }
    }
  })
  it('n’a rien de dur dans les deux jours avant la course', () => {
    for (const s of plan.semaines[11].seances) {
      const avant = joursEntre(s.date, dixKm.date)
      if (avant > 0 && avant <= 2) expect(s.categorie).toBe('facile')
    }
  })
  it('donne des identifiants uniques', () => {
    const ids = plan.semaines.flatMap((x) => x.seances).map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('cas particuliers', () => {
  it('retire les séances déjà passées quand on démarre en milieu de semaine', () => {
    const plan = genererPlan({ id: 'p', profil, objectif: dixKm, vdot: 45, dateDepart: '2026-11-19' })
    for (const s of plan.semaines[0].seances) expect(joursEntre('2026-11-19', s.date)).toBeGreaterThanOrEqual(0)
  })
  it('refuse une date passée ou trop lointaine', () => {
    expect(() => genererPlan({ id: 'p', profil, objectif: { ...dixKm, date: '2026-11-01' }, vdot: 45, dateDepart: '2026-11-16' })).toThrow()
    expect(() => genererPlan({ id: 'p', profil, objectif: { ...dixKm, date: '2028-01-01' }, vdot: 45, dateDepart: '2026-11-16' })).toThrow()
  })
  it('exige une évaluation hors programme débutant', () => {
    expect(() => genererPlan({ id: 'p', profil, objectif: dixKm, vdot: null, dateDepart: '2026-11-16' })).toThrow()
  })
  it('course le jour même : une seule séance, la course', () => {
    const plan = genererPlan({ id: 'p', profil, objectif: { ...dixKm, date: '2026-11-16' }, vdot: 45, dateDepart: '2026-11-16' })
    expect(plan.semaines).toHaveLength(1)
    expect(plan.semaines[0].seances.map((s) => s.type)).toEqual(['course'])
  })
  it('prévient en cas de blessure signalée et de marathon mal préparé', () => {
    const plan = genererPlan({
      id: 'p',
      profil: { ...profil, blessures: 'tendon d’Achille', volumeHebdoKm: 20 },
      objectif: { ...dixKm, distanceM: 42195, date: '2027-01-10' },
      vdot: 45,
      dateDepart: '2026-11-16',
    })
    expect(plan.avertissements).toHaveLength(2)
  })
  it('six sorties par semaine : deux séances de qualité en phase spécifique seulement', () => {
    const plan = genererPlan({ id: 'p', profil: { ...profil, joursDisponibles: [0, 1, 2, 3, 5, 6], volumeHebdoKm: 70 }, objectif: dixKm, vdot: 60, dateDepart: '2026-11-16' })
    const dures = (i: number) => plan.semaines[i].seances.filter((s) => s.categorie !== 'facile').length
    expect(dures(0)).toBe(1)
    expect(dures(7)).toBe(2)
  })
  it('traite un trail selon sa distance équivalente à plat', () => {
    const trail: Objectif = { id: 't', version: 1, type: 'trail', nom: 'Trail', distanceM: 20000, deniveleM: 1200, date: '2027-02-07' }
    // Pente moyenne 12 % : 10 000 × (6,5295 + 1,9913) / 3,6 = 23 669 m
    expect(distanceEffort(trail)).toBeCloseTo(23669, 0)
    const plan = genererPlan({ id: 'p', profil, objectif: trail, vdot: 45, dateDepart: '2026-11-16' })
    const longue = plan.semaines[2].seances.find((s) => s.type === 'sortieLongue')!
    expect(longue.consigne).toContain('dénivelé')
  })
})

describe('programme débutant', () => {
  const debutant: Profil = { ...profil, anneesPratique: 0, volumeHebdoKm: 0, joursDisponibles: [0, 1, 2, 3, 4, 5, 6] }
  const cinqKm: Objectif = { id: 'o5', version: 1, type: 'premier5k', nom: 'Mon premier 5 km', distanceM: 5000, date: '2027-01-24' }
  const plan = genererPlan({ id: 'd', profil: debutant, objectif: cinqKm, vdot: null, dateDepart: '2026-11-16' })
  it('progresse de la première à la dernière étape', () => {
    expect(etapeDebutant(0, 10)).toBe(0)
    expect(etapeDebutant(9, 10)).toBe(9)
    expect(etapeDebutant(5, 6)).toBe(9)
    for (let i = 1; i < 10; i++) expect(etapeDebutant(i, 10)).toBeGreaterThanOrEqual(etapeDebutant(i - 1, 10))
  })
  it('propose 3 séances non consécutives par semaine', () => {
    const jours = plan.semaines[0].seances.map((s) => jourSemaine(s.date))
    expect(jours).toHaveLength(3)
    expect(jours[1] - jours[0]).toBeGreaterThanOrEqual(2)
    expect(jours[2] - jours[1]).toBeGreaterThanOrEqual(2)
  })
  it('commence par de la marche-course et finit par la course', () => {
    expect(plan.semaines[0].seances[0].type).toBe('marcheCourse')
    expect(plan.semaines[0].seances[0].titre).toContain('1 min de course')
    expect(plan.semaines.at(-1)!.seances.at(-1)!.type).toBe('course')
    expect(plan.vdotDepart).toBeUndefined()
  })
  it('allonge le temps de course d’une semaine à l’autre', () => {
    const course = (i: number) =>
      plan.semaines[i].seances[0].blocs.filter((b) => b.allure === 'aisance').reduce((s, b) => s + b.repetitions * (b.dureeS ?? 0), 0)
    for (let i = 1; i < plan.semaines.length - 1; i++) expect(course(i)).toBeGreaterThanOrEqual(course(i - 1))
  })
  it('prévient quand le délai est trop court', () => {
    const court = genererPlan({ id: 'd', profil: debutant, objectif: { ...cinqKm, date: '2026-12-13' }, vdot: null, dateDepart: '2026-11-16' })
    expect(court.avertissements[0]).toContain('court')
  })
})
