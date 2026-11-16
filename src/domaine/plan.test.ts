import { describe, expect, it } from 'vitest'
import { ajouterJours, joursEntre, jourSemaine } from './dates'
import type { Objectif, Plan, Profil } from './modele'
import {
  calculerVolumes,
  choisirFiche,
  composerSemaine,
  cycleAllegee,
  decouperPhases,
  distanceEffort,
  etapeDebutant,
  familleDe,
  genererPlan,
  mesurerBloc,
  nombreQualite,
  placerJoursDurs,
  plafondVolume,
  reglerDuree,
  respectePlafonds,
  typesQualite,
} from './plan'
import { SEANCES } from './seances'
import { calculerAllures } from './vdot'

const profil: Profil = {
  id: 'moi',
  version: 2,
  prenom: 'Test',
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

const LUNDI = '2026-11-16'
const dixKm: Objectif = { id: 'o1', version: 2, type: 'route', nom: '10 km', distanceM: 10000, date: '2027-02-07' }
const marathon: Objectif = { id: 'o2', version: 2, type: 'route', nom: 'Marathon', distanceM: 42195, date: '2027-04-04' }
const trail: Objectif = { id: 't', version: 2, type: 'trail', nom: 'Trail', distanceM: 20000, deniveleM: 1200, date: '2027-02-07' }
const fichesParId = new Map(SEANCES.map((f) => [f.id, f]))

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
  it('un exercice prend du temps mais pas de kilomètres', () => {
    const m = mesurerBloc({ repetitions: 3, dureeS: 40, allure: 'exercice', recupS: 30, recupMode: 'arret', libelle: 'Planche' }, allures)
    expect(m).toEqual({ dureeS: 3 * 40 + 2 * 30, distanceM: 0 })
  })
})

describe('phases', () => {
  it('12 semaines : 5 de foncier, 5 spécifiques, 2 d’affûtage', () => {
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
  it('n’augmente jamais de plus de 10 % d’une semaine de charge à l’autre', () => {
    const charges = v.filter((_, i) => phases[i] !== 'affutage' && !v[i].allegee).map((x) => x.km)
    for (let i = 1; i < charges.length; i++) expect(charges[i] / charges[i - 1]).toBeLessThanOrEqual(1.1)
  })
  it('allège une semaine sur quatre par défaut', () => {
    expect(v.map((x) => x.allegee)).toEqual([false, false, false, true, false, false, false, true, false, false, false, false])
    expect(v[3].km).toBe(Math.round(40 * 1.08 * 1.08 * 0.75))
  })
  it('allège une semaine sur trois pour les débutants et à partir de 50 ans', () => {
    expect(cycleAllegee(1, 30)).toBe(3)
    expect(cycleAllegee(3, 52)).toBe(3)
    expect(cycleAllegee(2, 35)).toBe(4)
    expect(calculerVolumes(decouperPhases(8), 20, 60, 3).map((x) => x.allegee)).toEqual([false, false, true, false, false, true, false, false])
  })
  it('peut repartir par une semaine allégée (réajustement pour fatigue)', () => {
    const r = calculerVolumes(decouperPhases(8), 40, 60, 4, true)
    expect(r[0]).toEqual({ km: 30, allegee: true })
    expect(r[1]).toEqual({ km: 40, allegee: false }) // retour au volume de référence, sans hausse
    expect(r[2].km).toBe(43)
  })
  it('réduit le volume de 41 à 60 % en affûtage (Bosquet, 2007)', () => {
    const pic = Math.max(...v.map((x) => x.km))
    expect(v[10].km / pic).toBeGreaterThan(0.4)
    expect(v[10].km / pic).toBeLessThan(0.59)
    expect(v[11].km).toBeLessThan(v[10].km)
    expect(v[11].km / pic).toBeGreaterThanOrEqual(0.4)
  })
  it('respecte le plafond, sans jamais descendre sous le volume actuel', () => {
    expect(Math.max(...calculerVolumes(decouperPhases(24), 40, 45).map((x) => x.km))).toBeLessThanOrEqual(45)
    expect(plafondVolume(5000, 3, 80)).toBe(80)
    expect(plafondVolume(5000, 3, 20)).toBe(42)
    expect(plafondVolume(42195, 7, 50)).toBe(98)
  })
})

describe('séances de qualité', () => {
  it('limite leur nombre selon les sorties et le niveau (Seiler & Kjerland, 2006)', () => {
    expect(nombreQualite(1, 'specifique', 3)).toBe(0)
    expect(nombreQualite(2, 'base', 3)).toBe(0)
    expect(nombreQualite(4, 'specifique', 3)).toBe(1)
    expect(nombreQualite(6, 'base', 3)).toBe(1)
    expect(nombreQualite(6, 'specifique', 3)).toBe(2)
    expect(nombreQualite(6, 'specifique', 1)).toBe(1)
  })
  it('range les objectifs par famille de distance', () => {
    expect(familleDe({ ...dixKm, distanceM: 1500 })).toBe('demiFond')
    expect(familleDe(dixKm)).toBe('cinqDix')
    expect(familleDe({ ...dixKm, distanceM: 21097 })).toBe('semi')
    expect(familleDe(marathon)).toBe('marathon')
  })
  it('alterne fartlek, seuil et côtes en phase foncière', () => {
    expect([0, 1, 2, 3].map((r) => typesQualite('base', r, 1, dixKm, profil)[0])).toEqual(['fartlek', 'seuil', 'cotes', 'seuil'])
  })
  it('remplace les côtes par du fartlek quand le coureur n’a pas de côte', () => {
    const sansCote = { ...profil, terrains: { ...profil.terrains, cotes: false } }
    expect(typesQualite('base', 2, 1, dixKm, sansCote)).toEqual(['fartlek'])
    expect(typesQualite('specifique', 0, 2, trail, sansCote)).toEqual(['fartlek', 'seuil'])
  })
  it('travaille l’intensité de la course en phase spécifique', () => {
    expect(typesQualite('specifique', 0, 2, marathon, profil)).toEqual(['allureSpecifique', 'seuil'])
    expect(typesQualite('specifique', 0, 2, dixKm, profil)).toEqual(['vmaLongue', 'seuil'])
    expect(typesQualite('specifique', 0, 2, { ...dixKm, distanceM: 1500 }, profil)).toEqual(['vitesse', 'vmaLongue'])
    expect(typesQualite('affutage', 0, 1, dixKm, profil)).toEqual(['affutage'])
  })
  it('vérifie les plafonds de Daniels (2014)', () => {
    const allures = calculerAllures(45)
    const seuil4x6 = SEANCES.find((f) => f.titre === 'Seuil 4 × 6 min')!
    // 24 min au seuil à 4:38/km ≈ 5,2 km : il faut au moins 52 km par semaine.
    expect(respectePlafonds(seuil4x6, 60, allures)).toBe(true)
    expect(respectePlafonds(seuil4x6, 40, allures)).toBe(false)
  })
  it('descend d’un niveau quand le volume est trop faible pour les fiches du niveau', () => {
    const allures = calculerAllures(45)
    const base = { type: 'seuil' as const, niveau: 2 as const, objectif: dixKm, profil, allures, dejaFaites: 0, allegee: false }
    expect(choisirFiche({ ...base, volumeKm: 60 }).niveau).toBe(2)
    expect(choisirFiche({ ...base, volumeKm: 35 }).niveau).toBe(1)
    // Rien ne tient dans 10 % de 15 km : on prend la fiche la plus courte du niveau 1.
    const secours = choisirFiche({ ...base, volumeKm: 15 })
    expect(secours.niveau).toBe(1)
    expect(secours.dureeMin).toBe(Math.min(...SEANCES.filter((f) => f.type === 'seuil' && f.niveau === 1).map((f) => f.dureeMin)))
  })
  it('avance dans les fiches à chaque nouvelle séance du même type', () => {
    const allures = calculerAllures(56)
    const base = { type: 'seuil' as const, niveau: 3 as const, objectif: dixKm, profil, allures, volumeKm: 90, allegee: false }
    const titres = [0, 1, 2].map((n) => choisirFiche({ ...base, dejaFaites: n }).titre)
    expect(new Set(titres).size).toBe(3)
    // Semaine allégée : première fiche du niveau inférieur.
    const allegee = choisirFiche({ ...base, dejaFaites: 2, allegee: true })
    expect(allegee.niveau).toBe(2)
    expect(allegee.id).toBe('seuil-n2-01')
  })
  it('écarte les séances sur piste et celles qui dépassent le temps disponible', () => {
    const allures = calculerAllures(45)
    const sansPiste = { ...profil, terrains: { ...profil.terrains, piste: false } }
    const base = { type: 'vmaLongue' as const, niveau: 2 as const, objectif: dixKm, allures, volumeKm: 60, allegee: false }
    for (let n = 0; n < 6; n++) expect(choisirFiche({ ...base, profil: sansPiste, dejaFaites: n }).terrain).toBeUndefined()
    for (let n = 0; n < 6; n++) expect(choisirFiche({ ...base, profil, dejaFaites: n, dureeMaxMin: 45 }).dureeMin).toBeLessThanOrEqual(46)
  })
})

describe('fiches à durée réglable', () => {
  const footing = SEANCES.find((f) => f.titre === 'Footing 45 min')!
  it('règle la durée totale et le titre', () => {
    const f = reglerDuree(footing, 52, calculerAllures(45))
    expect(f.titre).toBe('Footing 52 min')
    expect(f.dureeMin).toBe(52)
    // 2 min de mise en route + 3 min de retour au calme autour du corps
    expect(f.corps[0].dureeS).toBe(47 * 60)
  })
  it('reste dans les bornes de la fiche', () => {
    expect(reglerDuree(footing, 200, null).dureeMin).toBe(65)
    expect(reglerDuree(footing, 5, null).dureeMin).toBe(30)
  })
})

describe('placement', () => {
  it('éloigne les séances dures les unes des autres', () => {
    expect(placerJoursDurs([1, 3, 5, 6], 1, [6])).toEqual([3])
    expect(placerJoursDurs([0, 1, 2, 3, 4, 5, 6], 2, [6])).toEqual([1, 3])
    expect(placerJoursDurs([6], 2, [6])).toEqual([])
  })
  it('respecte le jour choisi pour la sortie longue', () => {
    const semaine = composerSemaine({ phase: 'base', rang: 0, volumeKm: 40, allegee: false, jours: [1, 3, 5, 6], allures: calculerAllures(45), objectif: dixKm, profil: { ...profil, sortieLongueJour: 5 }, compteurs: {} })
    expect(semaine.find((s) => s.fiche.type === 'sortieLongue')!.jour).toBe(5)
  })
})

describe('plan complet, 10 km en 12 semaines', () => {
  const plan = genererPlan({ id: 'p1', profil, objectif: dixKm, vdot: 45, dateDepart: LUNDI })
  const toutes = plan.semaines.flatMap((x) => x.seances)
  it('couvre du lundi de départ à la semaine de course', () => {
    expect(plan.semaines).toHaveLength(12)
    expect(plan.semaines[0].debut).toBe(LUNDI)
    expect(plan.semaines[11].debut).toBe('2027-02-01')
  })
  it('tire chaque séance de la base, avec son ressenti visé', () => {
    for (const s of toutes) {
      expect(s.rpeVise).toBeGreaterThanOrEqual(1)
      if (s.type === 'course') continue
      const fiche = fichesParId.get(s.ficheId!)
      expect(fiche, s.titre).toBeDefined()
      expect(fiche!.type).toBe(s.type)
      expect(fiche!.rpeVise).toBe(s.rpeVise)
    }
  })
  it('se termine par la course, le bon jour', () => {
    const derniere = plan.semaines[11].seances.at(-1)!
    expect(derniere.type).toBe('course')
    expect(derniere.date).toBe('2027-02-07')
    expect(derniere.distanceKm).toBe(10)
  })
  it('ne place les séances que sur les jours disponibles', () => {
    for (const s of toutes) if (s.type !== 'course') expect(profil.joursDisponibles).toContain(jourSemaine(s.date))
  })
  it('donne 4 séances par semaine hors semaine de course', () => {
    for (const semaine of plan.semaines.slice(0, 11)) expect(semaine.seances).toHaveLength(4)
  })
  it('varie les séances de qualité', () => {
    const qualite = toutes.filter((s) => s.categorie !== 'facile' && s.type !== 'course')
    expect(new Set(qualite.map((s) => s.titre)).size).toBeGreaterThanOrEqual(6)
    expect(new Set(qualite.map((s) => s.type)).size).toBeGreaterThanOrEqual(4)
  })
  it('accole renforcement et éducatifs à des footings', () => {
    const semaine = plan.semaines[2].seances
    expect(semaine.some((s) => s.titre.endsWith('+ éducatifs'))).toBe(true)
    expect(semaine.some((s) => s.titre.endsWith('+ renforcement'))).toBe(true)
    const avecRenfo = semaine.find((s) => s.titre.endsWith('+ renforcement'))!
    expect(avecRenfo.blocs.some((b) => b.partie === 'complement' && b.allure === 'exercice')).toBe(true)
    // Pas de renforcement pendant l'affûtage.
    expect(plan.semaines[11].seances.some((s) => s.titre.includes('renforcement'))).toBe(false)
  })
  it('garde la sortie longue sous 150 min et plus longue que les footings', () => {
    for (const semaine of plan.semaines.slice(0, 10)) {
      const longue = semaine.seances.find((s) => s.type === 'sortieLongue')!
      expect(longue.dureeMin).toBeLessThanOrEqual(150)
      for (const f of semaine.seances.filter((s) => s.type === 'endurance')) expect(longue.distanceKm).toBeGreaterThan(f.distanceKm)
    }
  })
  it('n’a rien de dur dans les deux jours avant la course', () => {
    for (const s of plan.semaines[11].seances) {
      const avant = joursEntre(s.date, dixKm.date)
      if (avant > 0 && avant <= 2) expect(s.categorie).toBe('facile')
    }
    expect(plan.semaines[11].seances.find((s) => joursEntre(s.date, dixKm.date) === 1)!.titre).toContain('Veille de course')
  })
  it('donne des identifiants uniques', () => {
    expect(new Set(toutes.map((s) => s.id)).size).toBe(toutes.length)
  })
})

// ───────────── Propriétés vérifiées sur un éventail de coureurs ─────────────

interface Cas {
  nom: string
  profil: Profil
  objectif: Objectif
  vdot: number
  semaines: number
}

function cas(): Cas[] {
  const liste: Cas[] = []
  const coureurs: [string, Partial<Profil>, number][] = [
    ['débutante 3 jours', { niveau: 1, anneesPratique: 0.5, volumeHebdoKm: 12, joursDisponibles: [1, 3, 6] }, 32],
    ['intermédiaire 4 jours', { niveau: 2, volumeHebdoKm: 35, joursDisponibles: [1, 3, 5, 6] }, 45],
    ['intermédiaire 5 jours, 45 min en semaine', { niveau: 2, volumeHebdoKm: 45, joursDisponibles: [0, 1, 3, 5, 6], dureeMaxSemaineMin: 45 }, 48],
    ['confirmé 6 jours', { niveau: 3, volumeHebdoKm: 70, joursDisponibles: [0, 1, 2, 3, 5, 6] }, 58],
    ['vétéran 2 jours', { niveau: 2, anneeNaissance: 1970, volumeHebdoKm: 20, joursDisponibles: [2, 6] }, 40],
    ['confirmée sans piste ni côte', { niveau: 3, volumeHebdoKm: 55, joursDisponibles: [1, 2, 4, 6], terrains: { piste: false, cotes: false, chemins: true } }, 52],
  ]
  const objectifs: Objectif[] = [{ ...dixKm, distanceM: 1500, nom: '1500 m', type: 'piste' }, { ...dixKm, distanceM: 5000, nom: '5 km' }, dixKm, { ...dixKm, distanceM: 21097, nom: 'Semi' }, marathon, trail]
  for (const [nom, modif, vdot] of coureurs) {
    for (const objectif of objectifs) {
      for (const semaines of [6, 13, 24]) {
        const date = ajouterJours(LUNDI, semaines * 7 - 1) // dimanche de la dernière semaine
        liste.push({ nom: `${nom}, ${objectif.nom}, ${semaines} sem.`, profil: { ...profil, ...modif }, objectif: { ...objectif, date }, vdot, semaines })
      }
    }
  }
  return liste
}

function planDe(c: Cas): Plan {
  return genererPlan({ id: 'p', profil: c.profil, objectif: c.objectif, vdot: c.vdot, dateDepart: LUNDI })
}

describe('propriétés du moteur, sur 108 combinaisons coureur × objectif × durée', () => {
  const tous = cas().map((c) => ({ c, plan: planDe(c) }))

  it('génère des plans de 6 à 24 semaines', () => {
    expect(tous).toHaveLength(108)
    for (const { c, plan } of tous) expect(plan.semaines, c.nom).toHaveLength(c.semaines)
  })

  it('n’augmente jamais le volume de plus de 10 % d’une semaine de charge à la suivante', () => {
    for (const { c, plan } of tous) {
      let reference = Math.max(c.profil.volumeHebdoKm, 8)
      plan.semaines.forEach((s) => {
        if (s.allegee || s.phase === 'affutage') return
        // Sous 15 km par semaine, les durées minimales des séances (20 min de footing,
        // 40 min de sortie longue) pèsent plus que la règle : elle n'est pas vérifiée.
        // Tolérance de 0,3 km : les distances des séances sont arrondies à 100 m.
        if (reference >= 15) expect(s.volumeKm, `${c.nom}, semaine ${s.numero}`).toBeLessThanOrEqual(reference * 1.1 + 0.3)
        reference = s.volumeKm
      })
    }
  })

  it('place une semaine allégée toutes les 3 ou 4 semaines', () => {
    for (const { c, plan } of tous) {
      let depuis = 0
      for (const s of plan.semaines.filter((x) => x.phase !== 'affutage')) {
        depuis = s.allegee ? 0 : depuis + 1
        expect(depuis, `${c.nom}, semaine ${s.numero}`).toBeLessThanOrEqual(3)
      }
    }
  })

  it('allège vraiment les semaines allégées', () => {
    for (const { c, plan } of tous) {
      plan.semaines.forEach((s, i) => {
        if (s.allegee && i > 0) expect(s.volumeKm, `${c.nom}, semaine ${s.numero}`).toBeLessThan(plan.semaines[i - 1].volumeKm)
      })
    }
  })

  it('garde au moins deux tiers de séances faciles (repère 80/20 de Seiler)', () => {
    for (const { c, plan } of tous) {
      const seances = plan.semaines.flatMap((s) => s.seances).filter((s) => s.type !== 'course')
      const faciles = seances.filter((s) => s.categorie === 'facile').length
      // Avec 2 sorties par semaine, une séance de qualité représente déjà la moitié ;
      // avec 3, un tiers, et la semaine de course (tronquée) fait encore baisser la part.
      const nbJours = c.profil.joursDisponibles.length
      const minimum = nbJours <= 2 ? 0.5 : nbJours === 3 ? 0.6 : 2 / 3
      expect(faciles / seances.length, c.nom).toBeGreaterThanOrEqual(minimum)
    }
  })

  it('ne programme jamais deux séances dures deux jours de suite quand il reste de la place', () => {
    for (const { c, plan } of tous) {
      if (c.profil.joursDisponibles.length > 5) continue
      const dures = plan.semaines.flatMap((s) => s.seances).filter((s) => s.categorie !== 'facile' && s.type !== 'course')
      for (let i = 1; i < dures.length; i++) expect(joursEntre(dures[i - 1].date, dures[i].date), c.nom).toBeGreaterThanOrEqual(2)
    }
  })

  it('réduit le volume pendant l’affûtage et finit par la course', () => {
    for (const { c, plan } of tous) {
      const pic = Math.max(...plan.semaines.filter((s) => s.phase !== 'affutage').map((s) => s.volumeKm))
      const affutage = plan.semaines.filter((s) => s.phase === 'affutage')
      const horsCourse = (i: number) => affutage[i].seances.filter((s) => s.type !== 'course').reduce((t, s) => t + s.distanceKm, 0)
      expect(horsCourse(0), c.nom).toBeLessThan(pic * 0.8)
      expect(plan.semaines.at(-1)!.seances.at(-1)!.type, c.nom).toBe('course')
    }
  })

  it('respecte le temps disponible en semaine', () => {
    for (const { c, plan } of tous) {
      const max = c.profil.dureeMaxSemaineMin
      if (!max) continue
      const longue = c.profil.sortieLongueJour ?? 6
      for (const s of plan.semaines.flatMap((x) => x.seances)) {
        if (s.type === 'course' || jourSemaine(s.date) === longue) continue
        expect(s.dureeMin, `${c.nom} : ${s.titre}`).toBeLessThanOrEqual(max + 3)
      }
    }
  })

  it('ne propose ni piste ni côte à qui n’en a pas', () => {
    for (const { c, plan } of tous) {
      for (const s of plan.semaines.flatMap((x) => x.seances)) {
        const fiche = s.ficheId ? fichesParId.get(s.ficheId) : undefined
        if (!c.profil.terrains.cotes) expect(s.type, c.nom).not.toBe('cotes')
        // Seule exception : le type « vitesse » de niveau 3 n'existe que sur piste.
        if (!c.profil.terrains.piste && s.type !== 'vitesse' && s.type !== 'affutage') expect(fiche?.terrain, `${c.nom} : ${s.titre}`).not.toBe('piste')
      }
    }
  })
})

describe('cas particuliers', () => {
  it('retire les séances déjà passées quand on démarre en milieu de semaine', () => {
    const plan = genererPlan({ id: 'p', profil, objectif: dixKm, vdot: 45, dateDepart: '2026-11-19' })
    for (const s of plan.semaines[0].seances) expect(joursEntre('2026-11-19', s.date)).toBeGreaterThanOrEqual(0)
    // La semaine suivante reste bornée par le volume de départ, pas par la semaine tronquée.
    expect(plan.semaines[1].volumeKm).toBeGreaterThan(35)
  })
  it('refuse une date passée, ou un objectif à plus de 24 semaines', () => {
    expect(() => genererPlan({ id: 'p', profil, objectif: { ...dixKm, date: '2026-11-01' }, vdot: 45, dateDepart: LUNDI })).toThrow()
    expect(() => genererPlan({ id: 'p', profil, objectif: { ...dixKm, date: ajouterJours(LUNDI, 24 * 7) }, vdot: 45, dateDepart: LUNDI })).toThrow(/24 semaines/)
    expect(() => genererPlan({ id: 'p', profil, objectif: { ...dixKm, date: ajouterJours(LUNDI, 24 * 7 - 1) }, vdot: 45, dateDepart: LUNDI })).not.toThrow()
  })
  it('prévient sous 6 semaines, sans refuser', () => {
    const plan = genererPlan({ id: 'p', profil, objectif: { ...dixKm, date: ajouterJours(LUNDI, 20) }, vdot: 45, dateDepart: LUNDI })
    expect(plan.semaines).toHaveLength(3)
    expect(plan.avertissements.join(' ')).toContain('Moins de 6 semaines')
  })
  it('exige une évaluation hors programme débutant', () => {
    expect(() => genererPlan({ id: 'p', profil, objectif: dixKm, vdot: null, dateDepart: LUNDI })).toThrow()
  })
  it('course le jour même : une seule séance, la course', () => {
    const plan = genererPlan({ id: 'p', profil, objectif: { ...dixKm, date: LUNDI }, vdot: 45, dateDepart: LUNDI })
    expect(plan.semaines).toHaveLength(1)
    expect(plan.semaines[0].seances.map((s) => s.type)).toEqual(['course'])
  })
  it('prévient en cas de signal de santé, de blessure et de marathon mal préparé', () => {
    const plan = genererPlan({
      id: 'p',
      profil: { ...profil, blessureRecente: true, alerteSante: true, volumeHebdoKm: 20 },
      objectif: { ...marathon, date: '2027-01-10' },
      vdot: 45,
      dateDepart: LUNDI,
    })
    expect(plan.avertissements).toHaveLength(3)
    expect(plan.avertissements[0]).toContain('médecin')
  })
  it('six sorties par semaine : deux séances de qualité en phase spécifique seulement', () => {
    const plan = genererPlan({ id: 'p', profil: { ...profil, niveau: 3, joursDisponibles: [0, 1, 2, 3, 5, 6], volumeHebdoKm: 70 }, objectif: dixKm, vdot: 60, dateDepart: LUNDI })
    const dures = (i: number) => plan.semaines[i].seances.filter((s) => s.categorie !== 'facile').length
    expect(dures(0)).toBe(1)
    expect(dures(6)).toBe(2)
  })
  it('traite un trail selon sa distance équivalente à plat', () => {
    // Pente moyenne 12 % : 10 000 × (6,5295 + 1,9913) / 3,6 = 23 669 m
    expect(distanceEffort(trail)).toBeCloseTo(23669, 0)
    const plan = genererPlan({ id: 'p', profil, objectif: trail, vdot: 45, dateDepart: LUNDI })
    const longue = plan.semaines[2].seances.find((s) => s.type === 'sortieLongue')!
    expect(longue.consigne).toContain('dénivelé')
    expect(plan.semaines.flatMap((s) => s.seances).some((s) => s.type === 'cotes')).toBe(true)
  })
})

describe('programme débutant', () => {
  const debutant: Profil = { ...profil, niveau: 1, anneesPratique: 0, volumeHebdoKm: 0, joursDisponibles: [0, 1, 2, 3, 4, 5, 6] }
  const cinqKm: Objectif = { id: 'o5', version: 2, type: 'premier5k', nom: 'Mon premier 5 km', distanceM: 5000, date: '2027-01-24' }
  const plan = genererPlan({ id: 'd', profil: debutant, objectif: cinqKm, vdot: null, dateDepart: LUNDI })
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
    const court = genererPlan({ id: 'd', profil: debutant, objectif: { ...cinqKm, date: '2026-12-13' }, vdot: null, dateDepart: LUNDI })
    expect(court.avertissements[0]).toContain('court')
  })
})
