import { describe, expect, it } from 'vitest'
import { type ContexteConseil, conseilPour, contexteDe } from './conseils'
import { etapesDe } from './deroule'
import type { Activite, Objectif, Profil } from './modele'
import { ECHELLE_RPE, calculerBadges, meilleureSerie, nouveauxBadges, palierActuel, serieEnCours } from './motivation'
import { genererPlan } from './plan'
import { calculerAllures } from './vdot'

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
const plan = genererPlan({ id: 'p', profil, objectif, vdot: 45, dateDepart: '2026-11-16' })
const allures = calculerAllures(45)
const seances = plan.semaines.flatMap((s) => s.seances)

let n = 0
function activite(date: string, km = 8, min = 48, rpe?: number, seanceId?: string): Activite {
  return { id: `a${n++}`, version: 2, date, source: 'manuel', distanceM: km * 1000, dureeS: min * 60, tours: [], commentaire: '', ...(rpe !== undefined ? { rpe } : {}), ...(seanceId ? { seanceId } : {}) }
}

describe('déroulé étape par étape', () => {
  const fartlek = seances.find((s) => s.titre.startsWith('Fartlek 8 × 1 min'))!
  const etapes = etapesDe(fartlek, allures)
  it('développe chaque répétition et sa récupération', () => {
    // Échauffement : 15 min + 4 lignes droites (4 efforts, 3 récupérations) ; corps : 8 efforts, 7 récupérations ; retour.
    expect(etapes).toHaveLength(1 + 7 + 15 + 1)
    const corps = etapes.filter((e) => e.partie === 'Séance')
    expect(corps.filter((e) => e.genre === 'effort')).toHaveLength(8)
    expect(corps.filter((e) => e.genre === 'recuperation')).toHaveLength(7)
    expect(corps[0]).toMatchObject({ titre: 'Vite', repetition: '1 / 8', dureeS: 60 })
    expect(corps[1]).toMatchObject({ titre: 'Récupération en trottinant', dureeS: 60 })
    expect(corps.at(-1)!.repetition).toBe('8 / 8')
  })
  it('garde la durée totale de la séance', () => {
    const total = etapes.reduce((s, e) => s + (e.dureeS ?? 0), 0)
    expect(Math.round(total / 60)).toBe(fartlek.dureeMin)
  })
  it('affiche l’allure et la zone', () => {
    expect(etapes[0]).toMatchObject({ partie: 'Échauffement', titre: 'Endurance', genre: 'facile' })
    expect(etapes[0].detail).toMatch(/\d:\d\d à \d:\d\d\/km · zone 2/)
    expect(etapes.find((e) => e.genre === 'effort' && e.partie === 'Séance')!.detail).toMatch(/^\d:\d\d\/km · zone 4$/)
  })
  it('ne donne pas d’allure à plat pour une côte', () => {
    const cotes = seances.find((s) => s.type === 'cotes')!
    const montee = etapesDe(cotes, allures).find((e) => e.partie === 'Séance' && e.genre === 'effort')!
    expect(montee.detail).not.toMatch(/\/km/)
    expect(montee.detail).toContain('Côte')
  })
  it('nomme les exercices de renforcement', () => {
    const avecRenfo = seances.find((s) => s.titre.endsWith('+ renforcement'))!
    const exercices = etapesDe(avecRenfo, allures).filter((e) => e.partie === 'Complément')
    expect(exercices.length).toBeGreaterThan(3)
    expect(exercices[0].genre).toBe('exercice')
    expect(exercices[0].titre.length).toBeGreaterThan(5)
  })
  it('fonctionne pour un débutant sans allures', () => {
    const debutant = genererPlan({ id: 'd', profil: { ...profil, niveau: 1 }, objectif: { ...objectif, type: 'premier5k', distanceM: 5000 }, vdot: null, dateDepart: '2026-11-16' })
    const etapesDebutant = etapesDe(debutant.semaines[0].seances[0], null)
    expect(etapesDebutant[0]).toMatchObject({ titre: 'Marche', dureeS: 300 })
    expect(etapesDebutant.filter((e) => e.titre === 'Course lente')).toHaveLength(8)
    expect(etapesDebutant.filter((e) => e.titre === 'Récupération en marchant')).toHaveLength(7)
  })
})

describe('conseil de la séance', () => {
  const contexte: ContexteConseil = { phase: 'base', semaineAllegee: false, joursAvantCourse: 60, blessureRecente: false, ecartRpePrecedent: 0, dejaFaitesDuType: 3 }
  const footing = seances.find((s) => s.type === 'endurance')!
  const seuil = seances.find((s) => s.type === 'seuil')!
  it('donne un seul conseil, non vide, pour chaque séance du plan', () => {
    for (const s of seances) expect(conseilPour(s, contexte).length, s.titre).toBeGreaterThan(30)
  })
  it('varie d’une séance à l’autre du même type', () => {
    expect(conseilPour(footing, { ...contexte, dejaFaitesDuType: 1 })).not.toBe(conseilPour(footing, { ...contexte, dejaFaitesDuType: 2 }))
  })
  it('accompagne la première séance d’un type', () => {
    expect(conseilPour(seuil, { ...contexte, dejaFaitesDuType: 0 })).toContain('Première séance de ce type')
    expect(conseilPour(footing, { ...contexte, dejaFaitesDuType: 0 })).not.toContain('Première séance')
  })
  it('fait passer la prudence avant tout après une blessure', () => {
    expect(conseilPour(seuil, { ...contexte, blessureRecente: true, semaineAllegee: true })).toContain('blessure')
    expect(conseilPour(footing, { ...contexte, blessureRecente: true })).not.toContain('blessure')
  })
  it('tient compte d’une séance précédente trop dure', () => {
    expect(conseilPour(footing, { ...contexte, ecartRpePrecedent: 2 })).toContain('récupérer')
    expect(conseilPour(seuil, { ...contexte, ecartRpePrecedent: 3 })).toContain('variante plus facile')
    expect(conseilPour(seuil, { ...contexte, ecartRpePrecedent: 1 })).not.toContain('variante')
  })
  it('s’adapte à la semaine allégée, à l’approche de la course et au jour J', () => {
    expect(conseilPour(seuil, { ...contexte, semaineAllegee: true })).toContain('Semaine allégée')
    expect(conseilPour(footing, { ...contexte, joursAvantCourse: 2 })).toContain('La course approche')
    expect(conseilPour(seances.at(-1)!, contexte)).toContain('Partez prudemment')
  })
})

describe('contexte du conseil, tiré du plan et du journal', () => {
  const seuil = seances.find((s) => s.type === 'seuil')! // semaine 2
  it('lit la phase, la semaine et la distance à la course', () => {
    const c = contexteDe(seuil, plan, [], profil, objectif)
    expect(c).toMatchObject({ phase: 'base', semaineAllegee: false, blessureRecente: false, ecartRpePrecedent: null, dejaFaitesDuType: 0 })
    expect(c.joursAvantCourse).toBeGreaterThan(60)
  })
  it('retient l’écart de ressenti de la dernière séance et compte les séances du type', () => {
    const premiere = seances[0]
    const journal = [activite(premiere.date, 9, 60, premiere.rpeVise + 3, premiere.id), activite(seuil.date, 7, 35, 6, seuil.id)]
    expect(contexteDe(seuil, plan, [journal[0]], profil, objectif).ecartRpePrecedent).toBe(3)
    const suivante = seances.filter((s) => s.type === 'seuil')[1]
    expect(contexteDe(suivante, plan, journal, profil, objectif).dejaFaitesDuType).toBe(1)
  })
})

describe('échelle de ressenti', () => {
  it('décrit chaque niveau de 1 à 10', () => {
    expect(ECHELLE_RPE.map((n) => n.valeur)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (const niveau of ECHELLE_RPE) {
      expect(niveau.nom.length).toBeGreaterThanOrEqual(3)
      expect(niveau.repere.length).toBeGreaterThan(10)
    }
    expect(new Set(ECHELLE_RPE.map((n) => n.nom)).size).toBe(10)
  })
})

describe('séries', () => {
  const JOUR = '2026-12-09' // mercredi
  // Semaines du 16/11, du 23/11 et du 30/11 : 2 séances chacune.
  const troisSemaines = ['2026-11-17', '2026-11-19', '2026-11-24', '2026-11-28', '2026-12-01', '2026-12-05'].map((d) => activite(d))
  it('compte les semaines consécutives avec au moins 2 séances', () => {
    expect(serieEnCours(troisSemaines, null, JOUR)).toBe(3)
    expect(meilleureSerie(troisSemaines, null)).toBe(3)
  })
  it('ne casse pas la série tant que la semaine en cours n’est pas finie', () => {
    expect(serieEnCours([...troisSemaines, activite('2026-12-08')], null, JOUR)).toBe(3)
    expect(serieEnCours([...troisSemaines, activite('2026-12-08'), activite('2026-12-09')], null, JOUR)).toBe(4)
  })
  it('un jour de repos ne casse rien, une semaine vide oui', () => {
    const avecTrou = troisSemaines.filter((a) => a.date < '2026-11-23' || a.date > '2026-11-29')
    expect(serieEnCours(avecTrou, null, JOUR)).toBe(1)
    expect(serieEnCours([], null, JOUR)).toBe(0)
    expect(meilleureSerie([], null)).toBe(0)
  })
  it('une seule séance suffit quand le plan n’en prévoit qu’une', () => {
    const unJour = genererPlan({ id: 'u', profil: { ...profil, joursDisponibles: [6], volumeHebdoKm: 10 }, objectif, vdot: 45, dateDepart: '2026-11-16' })
    expect(serieEnCours([activite('2026-11-22'), activite('2026-11-29'), activite('2026-12-06')], unJour, JOUR)).toBe(3)
  })
})

describe('paliers', () => {
  it('monte avec les kilomètres cumulés', () => {
    expect(palierActuel([])).toMatchObject({ numero: 1, km: 0, prochainKm: 25, avancement: 0 })
    const p = palierActuel([activite('2026-11-17', 50)])
    // 50 km : palier 2 (25 km), à mi-chemin du palier 3 (75 km)
    expect(p).toMatchObject({ numero: 2, nom: 'Premières foulées', prochainKm: 75 })
    expect(p.avancement).toBeCloseTo(0.5, 6)
  })
  it('s’arrête au dernier palier', () => {
    expect(palierActuel([activite('2026-11-17', 3000)])).toMatchObject({ numero: 10, prochainKm: null, avancement: 1 })
  })
})

describe('badges', () => {
  const JOUR = '2026-11-30'
  const semaine1 = plan.semaines[0].seances
  it('en propose 10 au départ, aucun obtenu', () => {
    const badges = calculerBadges([], plan, JOUR)
    expect(badges).toHaveLength(10)
    expect(new Set(badges.map((b) => b.id)).size).toBe(10)
    expect(badges.every((b) => !b.obtenu && b.actuel === 0)).toBe(true)
  })
  it('donne le premier badge à la première séance', () => {
    const apres = calculerBadges([activite('2026-11-17')], plan, JOUR)
    expect(nouveauxBadges(calculerBadges([], plan, JOUR), apres).map((b) => b.id)).toEqual(['premier-pas'])
  })
  it('récompense une semaine où tout le prévu a été fait', () => {
    const toutes = semaine1.map((s) => activite(s.date, s.distanceKm, s.dureeMin, s.rpeVise, s.id))
    const badges = calculerBadges(toutes, plan, JOUR)
    expect(badges.find((b) => b.id === 'semaine-pleine')!.obtenu).toBe(true)
    expect(calculerBadges(toutes.slice(1), plan, JOUR).find((b) => b.id === 'semaine-pleine')!.obtenu).toBe(false)
    // La semaine en cours ne compte pas avant d'être terminée.
    expect(calculerBadges(toutes, plan, '2026-11-22').find((b) => b.id === 'semaine-pleine')!.obtenu).toBe(false)
  })
  it('récompense les footings courus vraiment facile, pas ceux courus trop vite', () => {
    const footings = seances.filter((s) => s.categorie === 'facile').slice(0, 5)
    const sages = footings.map((s) => activite(s.date, 8, 48, 3, s.id))
    const tropVite = footings.map((s) => activite(s.date, 8, 48, 6, s.id))
    expect(calculerBadges(sages, plan, JOUR).find((b) => b.id === 'sagesse')!.obtenu).toBe(true)
    expect(calculerBadges(tropVite, plan, JOUR).find((b) => b.id === 'sagesse')!.actuel).toBe(0)
  })
  it('suit l’avancement vers chaque badge', () => {
    const badges = calculerBadges([activite('2026-11-17', 30, 95, 4), activite('2026-11-19', 30, 60)], plan, JOUR)
    expect(badges.find((b) => b.id === 'cent-km')).toMatchObject({ actuel: 60, cible: 100, obtenu: false })
    expect(badges.find((b) => b.id === 'longue')!.obtenu).toBe(true)
    expect(badges.find((b) => b.id === 'a-l-ecoute')).toMatchObject({ actuel: 1, cible: 10 })
    expect(badges.find((b) => b.id === 'dix-seances')).toMatchObject({ actuel: 2, cible: 10 })
  })
  it('ne redonne pas un badge déjà obtenu', () => {
    const un = calculerBadges([activite('2026-11-17')], plan, JOUR)
    const deux = calculerBadges([activite('2026-11-17'), activite('2026-11-19')], plan, JOUR)
    expect(nouveauxBadges(un, deux)).toEqual([])
  })
})
