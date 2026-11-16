import { describe, expect, it } from 'vitest'
import type { Activite, Evaluation, Objectif, Profil } from '../domaine/modele'
import { genererPlan } from '../domaine/plan'
import { comparerPrevuRealise, historiqueNiveau, regulariteHebdo, serieRpe, synthetiser } from '../domaine/tableauDeBord'
import { COLONNES_CSV, exporterCsv } from './csv'
import { DocumentPdf, encoderWinAnsi } from './pdf'
import { construireRapport, lignesSeances } from './rapport'

const profil: Profil = {
  id: 'moi',
  version: 2,
  prenom: 'Noé',
  anneeNaissance: 1990,
  anneesPratique: 5,
  volumeHebdoKm: 40,
  joursDisponibles: [1, 3, 5, 6],
  blessures: '',
  niveau: 2,
  blessureRecente: false,
  alerteSante: false,
  materiel: { gps: true, cardio: true },
  terrains: { piste: true, cotes: true, chemins: true },
}
const objectif: Objectif = { id: 'o', version: 2, type: 'route', nom: 'Route 10 km', distanceM: 10000, date: '2027-02-07', tempsViseS: 2520 }
const evaluation: Evaluation = { id: 'e', version: 2, date: '2026-11-01', type: 'course', distanceM: 10000, dureeS: 2670, vdot: 45.9, vmaKmh: 15.4, fiabilite: 'bonne', note: '' }
const plan = genererPlan({ id: 'p', profil, objectif, vdot: 45.9, dateDepart: '2026-11-16' })
const [s1, s2, s3, s4] = plan.semaines[0].seances // mardi, jeudi, samedi, dimanche
const JOUR = '2026-11-23' // lundi de la 2e semaine

function faite(s: typeof s1, modif: Partial<Activite> = {}): Activite {
  return { id: `a-${s.id}`, version: 2, date: s.date, source: 'manuel', distanceM: s.distanceKm * 1000, dureeS: s.dureeMin * 60, tours: [], commentaire: '', rpe: s.rpeVise, seanceId: s.id, ...modif }
}
const horsPlan: Activite = { id: 'libre', version: 2, date: '2026-11-18', source: 'fit', distanceM: 5000, dureeS: 1800, tours: [{ distanceM: 2500, dureeS: 900 }, { distanceM: 2500, dureeS: 900 }], commentaire: 'Sortie; avec "Léa"', fcMoy: 141, rpe: 2 }
// Mardi fait comme prévu, jeudi plus dur et plus court, samedi manqué, dimanche fait sans ressenti, plus une sortie libre.
const journal = [faite(s1), faite(s2, { rpe: s2.rpeVise + 2, distanceM: s2.distanceKm * 1000 - 1500, dureeS: s2.dureeMin * 60 - 300 }), faite(s4, { rpe: undefined }), horsPlan]
const lignes = comparerPrevuRealise(plan, journal, JOUR)

describe('comparaison automatique du prévu et du réalisé', () => {
  it('donne une ligne par séance échue et par sortie libre, dans l’ordre des dates', () => {
    expect(lignes.map((l) => [l.date, l.statut])).toEqual([
      [s1.date, 'faite'],
      ['2026-11-18', 'horsPlan'],
      [s2.date, 'faite'],
      [s3.date, 'manquee'],
      [s4.date, 'faite'],
    ])
  })
  it('calcule les écarts de distance, de durée et de ressenti', () => {
    expect(lignes[0]).toMatchObject({ ecartKm: 0, ecartMin: 0, ecartRpe: 0, charge: s1.rpeVise * s1.dureeMin })
    expect(lignes[2]).toMatchObject({ ecartKm: -1.5, ecartMin: -5, ecartRpe: 2 })
    expect(lignes[3]).toMatchObject({ activite: null, ecartKm: null, ecartRpe: null, charge: null })
    expect(lignes[4]).toMatchObject({ ecartRpe: null, charge: null }) // faite, mais sans ressenti
  })
  it('ne compte pas comme manquées les séances à venir ni celle du jour', () => {
    expect(comparerPrevuRealise(plan, [], s1.date)).toEqual([])
    expect(comparerPrevuRealise(plan, [], s2.date).map((l) => l.statut)).toEqual(['manquee'])
    // Séance du jour déjà faite : elle apparaît.
    expect(comparerPrevuRealise(plan, [faite(s1)], s1.date).map((l) => l.statut)).toEqual(['faite'])
  })
  it('traite comme hors plan une sortie rattachée à un plan disparu, ou sans plan', () => {
    const orpheline = faite(s1, { seanceId: 'ancien-plan-s1' })
    expect(comparerPrevuRealise(plan, [orpheline], s1.date)[0].statut).toBe('horsPlan')
    expect(comparerPrevuRealise(null, [horsPlan], JOUR).map((l) => l.statut)).toEqual(['horsPlan'])
  })
  it('résume le tout', () => {
    const s = synthetiser(lignes)
    expect(s).toMatchObject({ seancesPrevues: 4, seancesFaites: 3, seancesManquees: 1, seancesHorsPlan: 1, ecartRpeMoyen: 1 })
    expect(s.kmPrevus).toBeCloseTo(s1.distanceKm + s2.distanceKm + s3.distanceKm + s4.distanceKm, 1)
    expect(s.kmRealises).toBeCloseTo(s1.distanceKm + s2.distanceKm - 1.5 + s4.distanceKm + 5, 1)
    expect(synthetiser([]).ecartRpeMoyen).toBeNull()
  })
})

describe('séries des graphiques', () => {
  it('mesure la régularité : séances faites sur séances prévues', () => {
    const [precedente, courante] = regulariteHebdo(plan, journal, JOUR, 2)
    expect(precedente).toMatchObject({ debut: '2026-11-16', prevues: 4, faites: 3, taux: 0.75 })
    // Lundi matin : rien n'est encore échu dans la semaine en cours.
    expect(courante).toMatchObject({ prevues: 0, faites: 0, taux: null })
    expect(regulariteHebdo(null, journal, JOUR, 1)[0].taux).toBeNull()
  })
  it('compte dans la semaine en cours les séances échues et celles déjà faites', () => {
    const [a, b] = plan.semaines[1].seances
    const [semaine] = regulariteHebdo(plan, [faite(b)], ajouter(a.date, 1), 1)
    // a est échue et manquée ; b est faite en avance.
    expect(semaine).toMatchObject({ prevues: 2, faites: 1, taux: 0.5 })
  })
  it('aligne ressenti prévu et réalisé des séances notées', () => {
    const serie = serieRpe(plan, journal, 10)
    expect(serie.map((p) => [p.date, p.rpeVise, p.rpe])).toEqual([
      [s1.date, s1.rpeVise, s1.rpeVise],
      [s2.date, s2.rpeVise, s2.rpeVise + 2],
    ])
    expect(serieRpe(plan, journal, 1)).toHaveLength(1)
  })
  it('range les évaluations dans l’ordre du temps', () => {
    const plusTard: Evaluation = { ...evaluation, id: 'e2', date: '2027-01-10', vdot: 47.2 }
    expect(historiqueNiveau([plusTard, evaluation]).map((e) => e.vdot)).toEqual([45.9, 47.2])
  })
})

function ajouter(date: string, jours: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + jours * 86_400_000).toISOString().slice(0, 10)
}

describe('export CSV', () => {
  const csv = exporterCsv(lignes)
  const rangs = csv.replace('﻿', '').trimEnd().split('\r\n')
  it('s’ouvre dans un tableur français : marque UTF-8, points-virgules, fins de ligne Windows', () => {
    expect(csv.startsWith('﻿')).toBe(true)
    expect(rangs[0]).toBe(COLONNES_CSV.join(';'))
    expect(rangs).toHaveLength(1 + lignes.length)
    expect(csv.endsWith('\r\n')).toBe(true)
  })
  it('met le prévu et le réalisé sur la même ligne, avec la virgule décimale', () => {
    const jeudi = rangs[3].split(';')
    expect(jeudi[0]).toBe(s2.date)
    expect(jeudi[1]).toBe('Faite')
    expect(jeudi[2]).toBe(s2.titre)
    expect(jeudi[4]).toBe(String(s2.distanceKm).replace('.', ','))
    expect(jeudi[5]).toBe(String(Math.round((s2.distanceKm - 1.5) * 100) / 100).replace('.', ','))
    expect(jeudi[12]).toBe(String(s2.rpeVise))
    expect(jeudi[13]).toBe(String(s2.rpeVise + 2))
    expect(jeudi[14]).toBe('2')
    expect(csv).not.toMatch(/\d\.\d/)
  })
  it('laisse vides les cases sans valeur', () => {
    const manquee = rangs[4].split(';')
    expect(manquee[1]).toBe('Manquée')
    expect(manquee[5]).toBe('')
    expect(manquee[13]).toBe('')
  })
  it('protège les points-virgules, les guillemets et les débuts de formule', () => {
    expect(rangs[2]).toContain('"Sortie; avec ""Léa"""')
    expect(rangs[2]).toContain(';Hors plan;')
    expect(rangs[2]).toContain(';2;Fichier .fit;') // 2 tours
    const piege = exporterCsv(comparerPrevuRealise(null, [{ ...horsPlan, commentaire: '=1+1' }], JOUR))
    expect(piege).toContain(";'=1+1")
  })
  it('donne l’allure en minutes décimales', () => {
    // 5 km en 30 min → 6 min/km
    expect(rangs[2].split(';')[8]).toBe('6')
  })
})

/** Vérifie la structure d'un PDF : en-tête, table des références exacte, fin de fichier. */
function verifierStructure(octets: Uint8Array): { pages: number; texte: string } {
  const texte = Array.from(octets, (o) => String.fromCharCode(o)).join('')
  expect(texte.startsWith('%PDF-1.4\n')).toBe(true)
  expect(texte.endsWith('%%EOF\n')).toBe(true)
  const debutTable = Number(/startxref\n(\d+)\n%%EOF/.exec(texte)![1])
  expect(texte.slice(debutTable, debutTable + 5)).toBe('xref\n')
  const entrees = [...texte.slice(debutTable).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
  // Chaque référence doit pointer exactement sur le début de son objet.
  entrees.forEach((position, i) => expect(texte.slice(position, position + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`))
  // Chaque flux doit avoir la longueur qu'il annonce.
  for (const m of texte.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const debut = m.index + m[0].length
    expect(texte.slice(debut + Number(m[1]), debut + Number(m[1]) + 9)).toBe('endstream')
  }
  expect(octets.every((o) => o < 0x80)).toBe(true)
  return { pages: Number(/\/Count (\d+)/.exec(texte)![1]), texte }
}

describe('écriture PDF', () => {
  it('encode le français en WinAnsi', () => {
    expect(encoderWinAnsi('été')).toEqual([0xe9, 0x74, 0xe9])
    expect(encoderWinAnsi('l’œuf – 5 €')).toEqual([0x6c, 0x92, 0x9c, 0x75, 0x66, 0x20, 0x96, 0x20, 0x35, 0x20, 0x80])
    expect(encoderWinAnsi('5 km')).toEqual([0x35, 0x20, 0x6b, 0x6d]) // espace fine → espace
    expect(encoderWinAnsi('日')).toEqual([0x3f]) // inconnu → « ? »
  })
  it('produit un fichier bien formé, accents et parenthèses compris', () => {
    const pdf = new DocumentPdf('pied')
    pdf.titre('Bilan (été)')
    pdf.paragraphe('Texte avec une barre oblique inverse \\ et des parenthèses (comme ça).')
    const { pages, texte } = verifierStructure(pdf.terminer())
    expect(pages).toBe(1)
    expect(texte).toContain('(Bilan \\(\\351t\\351\\))')
    expect(texte).toContain('\\\\')
  })
  it('passe à la page suivante et répète l’en-tête du tableau', () => {
    const pdf = new DocumentPdf('pied')
    pdf.tableau([{ titre: 'Colonne', largeur: 200 }], Array.from({ length: 120 }, (_, i) => [`ligne ${i}`]))
    const { pages, texte } = verifierStructure(pdf.terminer())
    expect(pages).toBe(3)
    expect(texte.match(/\(Colonne\)/g)).toHaveLength(3)
    expect(texte).toContain('page 3 / 3')
  })
  it('tronque une cellule trop longue plutôt que de déborder', () => {
    const pdf = new DocumentPdf('pied')
    pdf.tableau([{ titre: 'A', largeur: 60 }], [['Un texte beaucoup trop long pour la colonne']])
    expect(verifierStructure(pdf.terminer()).texte).toContain('\\205)') // points de suspension
  })
})

describe('bilan PDF', () => {
  const donnees = { profil, evaluations: [evaluation], objectifs: [objectif], plans: [plan], activites: journal }
  it('se construit avec un journal rempli', () => {
    const { texte, pages } = verifierStructure(construireRapport({ donnees, plan, objectif, evaluation, jour: JOUR }))
    expect(pages).toBeGreaterThanOrEqual(1)
    expect(texte).toContain('de No\\351')
    expect(texte).toContain('3 s\\351ances faites sur 4 pr\\351vues')
    expect(texte).toContain('Route 10 km')
  })
  it('se construit aussi sans rien : ni plan, ni journal, ni évaluation', () => {
    const vide = { profil: null, evaluations: [], objectifs: [], plans: [], activites: [] }
    const { texte } = verifierStructure(construireRapport({ donnees: vide, plan: null, objectif: null, evaluation: null, jour: JOUR }))
    expect(texte).toContain('Aucune s\\351ance enregistr\\351e')
  })
  it('liste les séances de la plus récente à la plus ancienne, prévu et réalisé côte à côte', () => {
    const rangees = lignesSeances(lignes, 60)
    expect(rangees[0][0]).toBe('22/11')
    expect(rangees[1]).toEqual(['21/11', s3.titre, `${String(s3.distanceKm).replace('.', ',')} km`, 'manquée', '', '', '', String(s3.rpeVise), '', ''])
    expect(rangees[2][9]).toBe('+2')
    expect(lignesSeances(lignes, 2)).toHaveLength(2)
  })
})
