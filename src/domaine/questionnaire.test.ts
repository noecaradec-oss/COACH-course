import { describe, expect, it } from 'vitest'
import { vdotDepuisFooting } from './evaluation'
import { determinerNiveau } from './niveau'
import {
  QUESTIONS,
  type Reponses,
  calculerProfil,
  estRepondue,
  joursPossibles,
  questionsVisibles,
  reponsesDepuis,
  reponsesVides,
  seancesMax,
} from './questionnaire'

const JOUR = '2026-11-16'

/** Coureuse intermédiaire, 10 km sur route, chrono récent. */
function reponses(modif: Partial<Reponses> = {}): Reponses {
  return {
    ...reponsesVides(),
    prenom: 'Léa',
    anneeNaissance: 1990,
    sexe: 'femme',
    typeObjectif: 'route',
    distanceM: 10000,
    dateCourse: '2027-02-07',
    tempsViseS: 2700,
    aChrono: true,
    chronoDistanceM: 5000,
    chronoDureeS: 1380,
    chronoAnciennete: 'moins3',
    volumeKm: 30,
    anneesPratique: 2,
    plusLongueSortieKm: 12,
    blessureRecente: false,
    alerteSante: false,
    jours: [1, 3, 5, 6],
    sortieLongueJour: 6,
    dureeMaxSemaineMin: 60,
    materiel: ['gps'],
    terrains: ['cotes', 'chemins'],
    ...modif,
  }
}
const profilDe = (modif: Partial<Reponses> = {}) => calculerProfil(reponses(modif), JOUR, 'e', 'o')

describe('le questionnaire', () => {
  it('pose 25 questions au plus', () => {
    expect(QUESTIONS.length).toBeLessThanOrEqual(25)
  })
  it('se remplit en moins de 5 minutes, même sur le parcours le plus long', () => {
    // Durées estimées par question (estimation d'entraîneur, pas un chronométrage).
    const plusLong = reponses({ typeObjectif: 'trail', blessureRecente: true, materiel: ['gps', 'cardio'] })
    const total = questionsVisibles(plusLong).reduce((s, q) => s + q.secondes, 0)
    expect(total).toBeLessThan(300)
    expect(QUESTIONS.reduce((s, q) => s + q.secondes, 0)).toBeLessThan(300)
  })
  it('couvre tous les thèmes demandés', () => {
    expect(new Set(QUESTIONS.map((q) => q.theme))).toEqual(
      new Set(['Vous', 'Objectif', 'Chronos', 'Volume et historique', 'Santé', 'Disponibilités', 'Matériel et préférences']),
    )
  })
  it('ne pose qu’une question par champ', () => {
    expect(new Set(QUESTIONS.map((q) => q.champ)).size).toBe(QUESTIONS.length)
  })
  it('saute les questions sans objet', () => {
    const champs = (r: Reponses) => questionsVisibles(r).map((q) => q.champ)
    const debutant = champs(reponses({ typeObjectif: 'premier5k', aChrono: false }))
    expect(debutant).not.toContain('distanceM')
    expect(debutant).not.toContain('tempsViseS')
    expect(debutant).not.toContain('allureFootingS')
    expect(debutant).not.toContain('sortieLongueJour')
    expect(champs(reponses())).not.toContain('deniveleM')
    expect(champs(reponses({ typeObjectif: 'trail' }))).toContain('deniveleM')
    expect(champs(reponses({ aChrono: false }))).toContain('allureFootingS')
    expect(champs(reponses({ aChrono: false }))).not.toContain('chronoDureeS')
    expect(champs(reponses({ blessureRecente: true }))).toContain('blessureDetail')
    expect(champs(reponses())).not.toContain('fcMax')
    expect(champs(reponses({ materiel: ['cardio'] }))).toContain('fcMax')
  })
  it('exige une réponse aux questions obligatoires seulement', () => {
    const vide = reponsesVides()
    const question = (champ: keyof Reponses) => QUESTIONS.find((q) => q.champ === champ)!
    expect(estRepondue(question('prenom'), vide)).toBe(true) // facultative
    expect(estRepondue(question('anneeNaissance'), vide)).toBe(false)
    expect(estRepondue(question('jours'), vide)).toBe(false)
    expect(estRepondue(question('blessureRecente'), { ...vide, blessureRecente: false })).toBe(true)
    expect(estRepondue(question('volumeKm'), { ...vide, volumeKm: 0 })).toBe(true)
  })
})

describe('niveau', () => {
  it('dépend de l’expérience et du volume, pas de la vitesse', () => {
    expect(determinerNiveau(0.5, 40, false)).toBe(1) // moins d'un an
    expect(determinerNiveau(5, 10, false)).toBe(1) // moins de 15 km
    expect(determinerNiveau(2, 30, false)).toBe(2)
    expect(determinerNiveau(5, 40, false)).toBe(2) // moins de 45 km
    expect(determinerNiveau(5, 45, false)).toBe(3)
    expect(determinerNiveau(5, 60, true)).toBe(1) // programme débutant
  })
})

describe('profil calculé', () => {
  it('sort niveau, VDOT, volume de départ et jours', () => {
    const { profil, evaluation, objectif, conseils, remarques } = profilDe()
    expect(profil.niveau).toBe(2)
    // 5 km en 23:00 : VO2 39,94 / fraction 0,9447 → VDOT 42,3
    expect(evaluation!.vdot).toBeCloseTo(42.3, 1)
    expect(evaluation!.fiabilite).toBe('bonne')
    expect(profil.volumeHebdoKm).toBe(30)
    expect(profil.joursDisponibles).toEqual([1, 3, 5, 6])
    expect(profil.sortieLongueJour).toBe(6)
    expect(profil.materiel).toEqual({ gps: true, cardio: false })
    expect(profil.terrains).toEqual({ piste: false, cotes: true, chemins: true })
    expect(objectif).toMatchObject({ type: 'route', distanceM: 10000, date: '2027-02-07', tempsViseS: 2700, nom: 'Route 10 km' })
    expect(conseils).toEqual([])
    expect(remarques).toEqual([])
  })

  it('signale un chrono ancien et baisse sa fiabilité', () => {
    const { evaluation, remarques } = profilDe({ chronoAnciennete: '6a12' })
    expect(evaluation!.fiabilite).toBe('faible')
    expect(evaluation!.date < '2026-06-01').toBe(true)
    expect(remarques[0]).toContain('plus de 3 mois')
    expect(profilDe({ chronoAnciennete: '3a6' }).evaluation!.fiabilite).toBe('moyenne')
  })

  it('estime le VDOT d’après l’allure de footing, faute de chrono', () => {
    // 6:15/km = 160 m/min → VO2 = 27,22 ; à 66,5 % du VDOT → 40,9
    expect(vdotDepuisFooting(375)).toBeCloseTo(40.9, 1)
    const { evaluation, remarques } = profilDe({ aChrono: false, chronoDistanceM: null, chronoDureeS: null, allureFootingS: 375 })
    expect(evaluation).toMatchObject({ type: 'footing', fiabilite: 'faible', vdot: 40.9 })
    expect(remarques[0]).toContain('approximatif')
  })

  it('ne devine pas un niveau sans chrono ni allure', () => {
    const { evaluation, remarques } = profilDe({ aChrono: false, chronoDistanceM: null, chronoDureeS: null })
    expect(evaluation).toBeNull()
    expect(remarques[0]).toContain('test de 6 minutes')
  })

  it('débutant : premier 5 km, niveau 1, 3 jours au plus, pas d’évaluation', () => {
    const { profil, evaluation, objectif, remarques } = profilDe({ typeObjectif: 'premier5k', aChrono: false, volumeKm: 0, anneesPratique: 0, jours: [0, 1, 2, 3, 4, 5, 6], sortieLongueJour: null })
    expect(profil.niveau).toBe(1)
    expect(profil.joursDisponibles).toHaveLength(3)
    expect(evaluation).toBeNull()
    expect(objectif).toMatchObject({ type: 'premier5k', distanceM: 5000, nom: 'Mon premier 5 km' })
    expect(objectif.tempsViseS).toBeUndefined()
    expect(remarques[0]).toContain('7 jours')
  })

  it('toute blessure récente déclenche le conseil de consulter et réduit le volume', () => {
    const { profil, conseils } = profilDe({ blessureRecente: true, blessureDetail: 'Périostite, reprise il y a 3 semaines' })
    expect(conseils).toHaveLength(1)
    expect(conseils[0]).toContain('consultez un médecin ou un kinésithérapeute')
    expect(profil.blessureRecente).toBe(true)
    expect(profil.blessures).toBe('Périostite, reprise il y a 3 semaines')
    expect(profil.volumeHebdoKm).toBe(24) // 80 % de 30
    // Même sans détail, la blessure est notée.
    expect(profilDe({ blessureRecente: true }).profil.blessures).toBe('Blessure récente')
  })

  it('un signal de santé renvoie vers un médecin', () => {
    const { profil, conseils } = profilDe({ alerteSante: true })
    expect(profil.alerteSante).toBe(true)
    expect(conseils[0]).toContain('consultez un médecin avant de commencer')
  })

  it('conseille un bilan médical à qui débute après 45 ans', () => {
    expect(profilDe({ anneeNaissance: 1975, anneesPratique: 0 }).conseils[0]).toContain('45 ans')
    expect(profilDe({ anneeNaissance: 1975, anneesPratique: 5 }).conseils).toEqual([])
    expect(profilDe({ anneeNaissance: 1990, anneesPratique: 0 }).conseils).toEqual([])
  })

  it('note le dénivelé pour un trail seulement', () => {
    expect(profilDe({ typeObjectif: 'trail', distanceM: 25000, deniveleM: 1200 }).objectif).toMatchObject({ deniveleM: 1200, nom: 'Trail 25 km' })
    expect(profilDe({ deniveleM: 1200 }).objectif.deniveleM).toBeUndefined()
  })

  it('refuse un questionnaire incomplet', () => {
    expect(() => calculerProfil(reponsesVides(), JOUR, 'e', 'o')).toThrow()
  })
})

describe('jours possibles', () => {
  it('monte la fréquence avec le niveau', () => {
    expect([1, 2, 3].map((n) => seancesMax(n as 1 | 2 | 3, false))).toEqual([4, 5, 6])
    expect(seancesMax(3, true)).toBe(3)
  })
  it('garde tous les jours cochés quand ils ne dépassent pas le maximum', () => {
    expect(joursPossibles([5, 1, 3], 4, null)).toEqual([1, 3, 5])
  })
  it('garde les jours les plus espacés, sortie longue comprise', () => {
    const jours = joursPossibles([0, 1, 2, 3, 4, 5, 6], 4, 6)
    expect(jours).toHaveLength(4)
    expect(jours).toContain(6)
    expect(joursPossibles([0, 1, 2, 3, 4, 5, 6], 3, null)).toEqual([0, 2, 4])
  })
  it('limite un coureur de niveau 1 à 4 jours', () => {
    const { profil, remarques } = profilDe({ volumeKm: 10, jours: [0, 1, 2, 3, 4, 5], sortieLongueJour: 5 })
    expect(profil.niveau).toBe(1)
    expect(profil.joursDisponibles).toHaveLength(4)
    expect(profil.joursDisponibles).toContain(5)
    expect(remarques.join(' ')).toContain('6 jours')
  })
})

describe('modifier ses réponses', () => {
  it('retrouve les réponses à partir des données enregistrées', () => {
    const depart = reponses({ fcRepos: 52 })
    const { profil, evaluation, objectif } = calculerProfil(depart, JOUR, 'e', 'o')
    expect(reponsesDepuis(profil, objectif, evaluation)).toEqual(depart)
  })
  it('refaire le questionnaire sans rien changer redonne le même profil', () => {
    const premier = profilDe({ blessureRecente: false, materiel: ['gps', 'cardio'], fcMax: 188 })
    const second = calculerProfil(reponsesDepuis(premier.profil, premier.objectif, premier.evaluation), JOUR, 'e', 'o')
    expect(second.profil).toEqual(premier.profil)
    expect(second.objectif).toEqual(premier.objectif)
    expect(second.evaluation!.vdot).toBe(premier.evaluation!.vdot)
  })
})
