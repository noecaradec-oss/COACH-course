// Générateur de plan d'entraînement.
//
// Trois étages : la périodisation (phases), le volume de chaque semaine,
// puis le contenu et le placement des séances. Les allures ne sont pas
// stockées dans le plan : chaque bloc porte un code d'allure, traduit en
// min/km à l'affichage avec le niveau du moment.

import type { CategorieIntensite } from './charge'
import { type DateIso, ajouterJours, joursEntre, lundiDe } from './dates'
import { distanceEquivalenteApprochee } from './denivele'
import type {
  AllureBloc,
  Bloc,
  JourSemaine,
  Objectif,
  Phase,
  Plan,
  Profil,
  SeancePrevue,
  SemainePlan,
  TypeSeance,
} from './modele'
import { VERSION_DONNEES } from './modele'
import { type Allures, allureDeReference, calculerAllures, predireTemps } from './vdot'

// ───────────────────────── Estimation d'un bloc ─────────────────────────

// Repères d'allure quand le coureur n'a pas de niveau mesuré (débutant) :
// marche active à 10:00/km, course en aisance à 7:30/km. Ordres de grandeur
// d'entraîneur, sans source ; ils ne servent qu'à estimer distance et durée.
const ALLURE_MARCHE = 600
const ALLURE_DEBUTANT = 450

export function allureBloc(allure: AllureBloc, allures: Allures | null): number {
  if (allure === 'marche') return ALLURE_MARCHE
  if (allure === 'aisance' || allure === 'course') return allures ? allures.E.lente : ALLURE_DEBUTANT
  if (!allures) return ALLURE_DEBUTANT
  return allureDeReference(allures, allure)
}

/** Durée (s) et distance (m) d'un bloc, récupérations comprises. */
export function mesurerBloc(bloc: Bloc, allures: Allures | null): { dureeS: number; distanceM: number } {
  const allure = allureBloc(bloc.allure, allures)
  const dureeRep = bloc.dureeS ?? ((bloc.distanceM ?? 0) / 1000) * allure
  const distanceRep = bloc.distanceM ?? ((bloc.dureeS ?? 0) / allure) * 1000
  // Pas de récupération après la dernière répétition.
  const nbRecups = bloc.recupS ? bloc.repetitions - 1 : 0
  const allureRecup = bloc.recupMode === 'marche' ? ALLURE_MARCHE : allureBloc('aisance', allures)
  const dureeRecup = nbRecups * (bloc.recupS ?? 0)
  return {
    dureeS: bloc.repetitions * dureeRep + dureeRecup,
    distanceM: bloc.repetitions * distanceRep + (dureeRecup / allureRecup) * 1000,
  }
}

export function mesurerBlocs(blocs: Bloc[], allures: Allures | null): { dureeMin: number; distanceKm: number } {
  let dureeS = 0
  let distanceM = 0
  for (const b of blocs) {
    const m = mesurerBloc(b, allures)
    dureeS += m.dureeS
    distanceM += m.distanceM
  }
  return { dureeMin: Math.round(dureeS / 60), distanceKm: Math.round(distanceM / 100) / 10 }
}

// ───────────────────────── Périodisation ─────────────────────────

export const SEMAINES_MAX = 36

/**
 * Découpe la préparation en phases : base, spécifique, affûtage.
 *
 * - Ordre général → spécifique → affûtage : Bompa & Buzzichelli (2018),
 *   « Periodization: Theory and Methodology of Training ».
 * - Affûtage de 2 semaines : Bosquet et al. (2007), Med Sci Sports Exerc
 *   (méta-analyse). Ramené à 1 semaine quand la préparation fait moins de
 *   8 semaines, pour garder du temps d'entraînement (choix d'entraîneur).
 * - Partage base 55 % / spécifique 45 % : choix d'entraîneur, sans source.
 */
export function decouperPhases(nbSemaines: number): Phase[] {
  const nbAffutage = nbSemaines >= 8 ? 2 : 1
  const reste = Math.max(0, nbSemaines - nbAffutage)
  const nbSpecifique = reste === 0 ? 0 : Math.max(1, Math.round(reste * 0.45))
  const nbBase = reste - nbSpecifique
  return [
    ...Array<Phase>(nbBase).fill('base'),
    ...Array<Phase>(nbSpecifique).fill('specifique'),
    ...Array<Phase>(Math.min(nbAffutage, nbSemaines)).fill('affutage'),
  ]
}

/**
 * Plafond de kilométrage hebdomadaire selon la distance préparée et le
 * nombre de jours d'entraînement. Jugement d'entraîneur, sans source : sert
 * de garde-fou, pas d'objectif. Jamais sous le volume actuel du coureur.
 */
export function plafondVolume(distanceM: number, nbJours: number, volumeActuelKm: number): number {
  const parDistance = distanceM <= 5000 ? 60 : distanceM <= 10000 ? 70 : distanceM <= 21100 ? 80 : 100
  return Math.max(volumeActuelKm, Math.min(parDistance, nbJours * 14))
}

// Hausse d'une semaine de charge à la suivante : +8 %. Repère de prudence,
// nettement sous les +30 % sur deux semaines associés à plus de blessures
// chez les débutants (Nielsen et al., 2014). Aucune étude ne valide un taux
// précis : Buist et al. (2008) ne trouvent pas d'effet protecteur des « 10 % ».
const HAUSSE_HEBDO = 1.08

// Une semaine allégée (−25 %) toutes les 4 semaines. Pratique d'entraîneur
// très répandue, sans preuve expérimentale directe.
const CYCLE_ALLEGEE = 4
const FACTEUR_ALLEGEE = 0.75

// Affûtage : volume réduit de 41 à 60 %, de façon progressive, sans baisser
// l'intensité (Bosquet et al., 2007). On retient −42 % puis −58 % sur deux
// semaines, −50 % sur une seule.
const FACTEURS_AFFUTAGE_2 = [0.58, 0.42]
const FACTEURS_AFFUTAGE_1 = [0.5]

export interface VolumeSemaine {
  km: number
  allegee: boolean
}

export function calculerVolumes(phases: Phase[], volumeDepartKm: number, plafondKm: number): VolumeSemaine[] {
  const volumes: VolumeSemaine[] = []
  let reference = volumeDepartKm
  const nbAffutage = phases.filter((p) => p === 'affutage').length
  let rangAffutage = 0
  let rangCharge = 0
  for (const phase of phases) {
    if (phase === 'affutage') {
      const facteurs = nbAffutage >= 2 ? FACTEURS_AFFUTAGE_2 : FACTEURS_AFFUTAGE_1
      volumes.push({ km: arrondir(reference * facteurs[rangAffutage++]), allegee: false })
      continue
    }
    if (rangCharge % CYCLE_ALLEGEE === CYCLE_ALLEGEE - 1) {
      volumes.push({ km: arrondir(reference * FACTEUR_ALLEGEE), allegee: true })
    } else {
      if (rangCharge > 0) reference = Math.min(reference * HAUSSE_HEBDO, plafondKm)
      volumes.push({ km: arrondir(reference), allegee: false })
    }
    rangCharge++
  }
  return volumes
}

function arrondir(km: number): number {
  return Math.round(km)
}

// ───────────────────────── Séances ─────────────────────────

const ECHAUFFEMENT: Bloc = { repetitions: 1, dureeS: 900, allure: 'E' }
const RETOUR_AU_CALME: Bloc = { repetitions: 1, dureeS: 600, allure: 'E' }

// Lignes droites : 6 × 20 s vite et relâché, récupération complète.
// Daniels (2014) les place après des footings pour entretenir la vitesse.
const LIGNES_DROITES: Bloc = { repetitions: 6, dureeS: 20, allure: 'R', recupS: 60, recupMode: 'trot' }

function borner(valeur: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valeur))
}

const CATEGORIES: Record<TypeSeance, CategorieIntensite> = {
  footing: 'facile',
  sortieLongue: 'facile',
  marcheCourse: 'facile',
  seuil: 'seuil',
  allureMarathon: 'seuil',
  intervalles: 'intense',
  repetitions: 'intense',
  cotes: 'intense',
  rappel: 'intense',
  course: 'intense',
}

interface Gabarit {
  type: TypeSeance
  titre: string
  blocs: Bloc[]
  consigne: string
}

const CONSIGNE_FACILE = 'Aisance respiratoire : vous devez pouvoir parler en phrases complètes.'

function footing(km: number, avecLignesDroites: boolean): Gabarit {
  const blocs: Bloc[] = [{ repetitions: 1, distanceM: Math.round(km * 10) * 100, allure: 'E' }]
  if (avecLignesDroites) blocs.push(LIGNES_DROITES)
  return {
    type: 'footing',
    titre: avecLignesDroites ? 'Footing + lignes droites' : 'Footing',
    blocs,
    consigne: avecLignesDroites
      ? `${CONSIGNE_FACILE} Terminez par 6 accélérations de 20 s, vite mais relâché.`
      : CONSIGNE_FACILE,
  }
}

function sortieLongue(km: number, objectif: Objectif): Gabarit {
  let consigne = `${CONSIGNE_FACILE} Partez lentement, l'important est la durée.`
  if (objectif.type === 'trail' && objectif.deniveleM && objectif.distanceM > 0) {
    // Même densité de dénivelé que la course visée (spécificité : Bompa & Buzzichelli, 2018).
    const dPlus = Math.round(((objectif.deniveleM / objectif.distanceM) * km * 1000) / 50) * 50
    if (dPlus > 0) consigne += ` Cherchez un parcours avec environ ${dPlus} m de dénivelé positif ; marchez dans les fortes pentes.`
  }
  return {
    type: 'sortieLongue',
    titre: 'Sortie longue',
    blocs: [{ repetitions: 1, distanceM: Math.round(km * 10) * 100, allure: 'E' }],
    consigne,
  }
}

/**
 * Seuil. Daniels (2014) : fractions de 5 à 15 min à l'allure T avec environ
 * 1 min de récupération pour 5 min d'effort, ou 20 min en continu ; total
 * plafonné à 10 % du kilométrage hebdomadaire. Plancher de 3 × 6 min : choix
 * d'entraîneur, qui dépasse légèrement les 10 % sous 40 km par semaine.
 */
function seuil(volumeKm: number, allures: Allures, continu: boolean): Gabarit {
  const budgetMin = (volumeKm * 0.1 * allures.T) / 60
  if (continu && budgetMin >= 20) {
    return {
      type: 'seuil',
      titre: 'Seuil : 20 min en continu',
      blocs: [ECHAUFFEMENT, { repetitions: 1, dureeS: 1200, allure: 'T' }, RETOUR_AU_CALME],
      consigne: 'Allure soutenue mais maîtrisée : « confortablement difficile », quelques mots possibles.',
    }
  }
  const n = borner(Math.round(budgetMin / 6), 3, 7)
  return {
    type: 'seuil',
    titre: `Seuil : ${n} × 6 min`,
    blocs: [ECHAUFFEMENT, { repetitions: n, dureeS: 360, allure: 'T', recupS: 75, recupMode: 'trot' }, RETOUR_AU_CALME],
    consigne: 'Allure soutenue mais maîtrisée. La dernière fraction doit ressembler à la première.',
  }
}

/**
 * Intervalles à VO2max.
 * - Fractions de 3 min, récupération en trot un peu plus courte que l'effort,
 *   total plafonné à 8 % du kilométrage hebdomadaire ou 10 km : Daniels (2014).
 * - Variante 30 s / 30 s à la vitesse de VO2max : Billat (2001), Sports Med,
 *   « Interval training for performance ».
 */
function intervalles(volumeKm: number, allures: Allures, variante3030: boolean): Gabarit {
  const budgetKm = Math.min(volumeKm * 0.08, 10)
  const budgetMin = (budgetKm * allures.I) / 60
  if (variante3030) {
    const parSerie = borner(Math.round(budgetMin), 6, 12)
    const serie: Bloc = { repetitions: parSerie, dureeS: 30, allure: 'I', recupS: 30, recupMode: 'trot' }
    return {
      type: 'intervalles',
      titre: `VMA : 2 × (${parSerie} × 30 s / 30 s)`,
      blocs: [ECHAUFFEMENT, serie, { repetitions: 1, dureeS: 180, allure: 'E' }, serie, RETOUR_AU_CALME],
      consigne: '30 s vite, 30 s de trot lent. 3 min de trot entre les deux séries. Arrêtez si l’allure chute.',
    }
  }
  const n = borner(Math.round(budgetMin / 3), 4, 8)
  return {
    type: 'intervalles',
    titre: `Intervalles : ${n} × 3 min`,
    blocs: [ECHAUFFEMENT, { repetitions: n, dureeS: 180, allure: 'I', recupS: 120, recupMode: 'trot' }, RETOUR_AU_CALME],
    consigne: 'Effort dur mais régulier. Trot lent pendant les 2 min de récupération.',
  }
}

/**
 * Répétitions courtes et rapides. Daniels (2014) : efforts de 2 min au plus,
 * récupération de 2 à 3 fois la durée de l'effort, total plafonné à 5 % du
 * kilométrage hebdomadaire ou 8 km.
 */
function repetitions(volumeKm: number, allures: Allures): Gabarit {
  const budgetMin = (Math.min(volumeKm * 0.05, 8) * allures.R) / 60
  const n = borner(Math.round(budgetMin), 6, 12)
  return {
    type: 'repetitions',
    titre: `Répétitions : ${n} × 1 min`,
    blocs: [ECHAUFFEMENT, { repetitions: n, dureeS: 60, allure: 'R', recupS: 150, recupMode: 'trot' }, RETOUR_AU_CALME],
    consigne: 'Vite et relâché, jamais crispé. Récupération complète : la qualité du geste prime.',
  }
}

/**
 * Allure marathon en continu. Daniels (2014) : au plus 110 min, et environ
 * 20 % du kilométrage hebdomadaire (chiffre cité de mémoire).
 */
function allureMarathon(volumeKm: number, allures: Allures): Gabarit {
  const km = Math.round(borner(Math.min(volumeKm * 0.2, (110 * 60) / allures.M), 5, 25))
  return {
    type: 'allureMarathon',
    titre: `Allure marathon : ${km} km`,
    blocs: [ECHAUFFEMENT, { repetitions: 1, distanceM: km * 1000, allure: 'M' }, RETOUR_AU_CALME],
    consigne: 'Calez-vous sur l’allure visée le jour J et répétez votre ravitaillement.',
  }
}

/**
 * Côtes courtes. Pratique d'entraîneur (renforcement et VO2max sans vitesse
 * élevée), sans source précise. L'allure I indique l'effort à viser, pas la
 * vitesse : en montée on court plus lentement.
 */
function cotes(volumeKm: number): Gabarit {
  const n = borner(Math.round(volumeKm / 5), 6, 10)
  return {
    type: 'cotes',
    titre: `Côtes : ${n} × 45 s`,
    blocs: [ECHAUFFEMENT, { repetitions: n, dureeS: 45, allure: 'I', recupS: 90, recupMode: 'trot' }, RETOUR_AU_CALME],
    consigne: 'Pente de 5 à 8 %. Montez à effort d’intervalles (l’allure sera plus lente), redescendez en trottinant.',
  }
}

/**
 * Rappel d'allure pendant l'affûtage : l'intensité est maintenue, le volume
 * réduit (Bosquet et al., 2007).
 */
function rappel(allure: 'T' | 'I'): Gabarit {
  return {
    type: 'rappel',
    titre: 'Rappel d’allure : 4 × 2 min',
    blocs: [ECHAUFFEMENT, { repetitions: 4, dureeS: 120, allure, recupS: 120, recupMode: 'trot' }, RETOUR_AU_CALME],
    consigne: 'Séance courte pour garder le rythme. Vous devez finir frais.',
  }
}

type Categorie = 'demiFond' | 'cinqDix' | 'semi' | 'marathon'

/**
 * Distance qui sert à choisir le type de préparation. En trail, on raisonne
 * sur la distance à plat équivalente (Minetti et al., 2002) : 30 km avec
 * 1500 m de dénivelé se préparent comme une épreuve bien plus longue.
 */
export function distanceEffort(objectif: Objectif): number {
  if (objectif.type === 'trail' && objectif.deniveleM) {
    return distanceEquivalenteApprochee(objectif.distanceM, objectif.deniveleM)
  }
  return objectif.distanceM
}

function categorieDistance(distanceM: number): Categorie {
  if (distanceM <= 3000) return 'demiFond'
  if (distanceM <= 12000) return 'cinqDix'
  if (distanceM <= 25000) return 'semi'
  return 'marathon'
}

// Séances de qualité de la phase spécifique, par distance préparée :
// on travaille surtout l'intensité de la course visée (spécificité,
// Bompa & Buzzichelli, 2018 ; accents par distance d'après Daniels, 2014).
const QUALITE_SPECIFIQUE: Record<Categorie, [TypeSeance, TypeSeance]> = {
  demiFond: ['repetitions', 'intervalles'],
  cinqDix: ['intervalles', 'seuil'],
  semi: ['seuil', 'intervalles'],
  marathon: ['allureMarathon', 'seuil'],
}

/**
 * Nombre de séances de qualité par semaine.
 * Seiler & Kjerland (2006) : environ 80 % de séances faciles. Donc une seule
 * séance de qualité jusqu'à 5 sorties par semaine ; deux à partir de 6, en
 * phase spécifique seulement (schéma de compétiteur, choix d'entraîneur).
 * Moins d'un an de pratique : une seule (prudence, choix d'entraîneur).
 */
export function nombreQualite(nbSeances: number, phase: Phase, anneesPratique: number): number {
  if (nbSeances <= 1) return 0
  if (nbSeances === 2) return phase === 'base' ? 0 : 1
  if (phase === 'specifique' && nbSeances >= 6 && anneesPratique >= 1) return 2
  return 1
}

function choisirQualite(
  phase: Phase,
  rang: number,
  nb: number,
  objectif: Objectif,
  anneesPratique: number,
): TypeSeance[] {
  if (nb === 0) return []
  if (phase === 'affutage') return ['rappel']
  let paire: [TypeSeance, TypeSeance]
  if (phase === 'base') paire = ['seuil', 'cotes']
  else if (objectif.type === 'trail') paire = ['cotes', 'seuil']
  else paire = QUALITE_SPECIFIQUE[categorieDistance(distanceEffort(objectif))]
  // Pas de répétitions très rapides la première année de pratique (prudence, choix d'entraîneur).
  if (anneesPratique < 1) paire = paire.map((t) => (t === 'repetitions' ? 'seuil' : t)) as [TypeSeance, TypeSeance]
  return nb >= 2 ? paire : [paire[rang % 2]]
}

function construireQualite(type: TypeSeance, rang: number, volumeKm: number, allures: Allures, objectif: Objectif): Gabarit {
  // Une semaine sur deux, on change de variante pour varier le stimulus.
  const variante = Math.floor(rang / 2) % 2 === 1
  switch (type) {
    case 'seuil':
      return seuil(volumeKm, allures, variante)
    case 'intervalles':
      return intervalles(volumeKm, allures, variante)
    case 'repetitions':
      return repetitions(volumeKm, allures)
    case 'allureMarathon':
      return allureMarathon(volumeKm, allures)
    case 'cotes':
      return cotes(volumeKm)
    default:
      return rappel(distanceEffort(objectif) <= 12000 ? 'I' : 'T')
  }
}

// ───────────────────────── Placement dans la semaine ─────────────────────────

function ecartCirculaire(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 7 - d)
}

/**
 * Répartit les séances dures sur les jours disponibles en les éloignant le
 * plus possible les unes des autres et des jours déjà pris (alternance dur /
 * facile : principe d'entraîneur classique, attribué à Bowerman ; pas de
 * source expérimentale). On essaie toutes les combinaisons : il y a 7 jours
 * au plus. À égalité, on garde les jours les plus tôt dans la semaine.
 */
export function placerJoursDurs(joursDisponibles: number[], nbDurs: number, dejaPris: number[] = []): number[] {
  const libres = joursDisponibles.filter((j) => !dejaPris.includes(j)).sort((a, b) => a - b)
  const nb = Math.min(nbDurs, libres.length)
  if (nb === 0) return []
  let meilleur: number[] = []
  let meilleurScore = [-1, -1]
  const essayer = (choisis: number[], depuis: number) => {
    if (choisis.length === nb) {
      const tous = [...dejaPris, ...choisis]
      let ecartMin = 7
      let somme = 0
      for (let i = 0; i < tous.length; i++) {
        for (let j = i + 1; j < tous.length; j++) {
          const e = ecartCirculaire(tous[i], tous[j])
          ecartMin = Math.min(ecartMin, e)
          somme += e
        }
      }
      if (ecartMin > meilleurScore[0] || (ecartMin === meilleurScore[0] && somme > meilleurScore[1])) {
        meilleur = choisis
        meilleurScore = [ecartMin, somme]
      }
      return
    }
    for (let i = depuis; i < libres.length; i++) essayer([...choisis, libres[i]], i + 1)
  }
  essayer([], 0)
  return meilleur
}

function jourSortieLongue(jours: number[]): number {
  if (jours.includes(6)) return 6
  if (jours.includes(5)) return 5
  return jours[jours.length - 1]
}

// ───────────────────────── Assemblage d'une semaine ─────────────────────────

function finaliser(g: Gabarit, id: string, date: DateIso, allures: Allures | null): SeancePrevue {
  const { dureeMin, distanceKm } = mesurerBlocs(g.blocs, allures)
  return { id, date, type: g.type, titre: g.titre, categorie: CATEGORIES[g.type], blocs: g.blocs, distanceKm, dureeMin, consigne: g.consigne }
}

function seanceCourse(objectif: Objectif, id: string, vdot: number | null): SeancePrevue {
  const distanceKm = Math.round(objectif.distanceM / 100) / 10
  // Durée estimée : temps prédit par le niveau actuel (Daniels & Gilbert, 1979),
  // sur la distance équivalente à plat en trail ; allure de débutant sinon.
  const dureeS = vdot !== null ? predireTemps(vdot, distanceEffort(objectif)) : distanceKm * ALLURE_DEBUTANT
  return {
    id,
    date: objectif.date,
    type: 'course',
    titre: objectif.nom || 'Course',
    categorie: 'intense',
    blocs: [{ repetitions: 1, distanceM: objectif.distanceM, allure: 'course' }],
    distanceKm,
    dureeMin: Math.round(dureeS / 60),
    consigne: 'C’est le jour J. Partez prudemment : le premier tiers doit sembler facile.',
  }
}

interface ContexteSemaine {
  phase: Phase
  rang: number
  volumeKm: number
  jours: number[]
  allures: Allures
  objectif: Objectif
  profil: Profil
}

// Footing plafonné à 75 min : au-delà, c'est une deuxième sortie longue.
// Choix d'entraîneur ; le volume de la semaine peut alors rester sous la cible.
const FOOTING_MAX_MIN = 75

/**
 * Compose les séances d'une semaine : qualité, sortie longue, footings.
 *
 * Sortie longue : au plus 30 % du kilométrage hebdomadaire sous 64 km par
 * semaine, 25 % au-delà, et jamais plus de 150 min (Daniels, 2014).
 * Deux écarts assumés, choix d'entraîneur :
 * - avec peu de sorties, on la garde au moins 25 % plus longue qu'un footing ;
 * - pour le marathon et les efforts plus longs, la part monte à un tiers,
 *   car 25 % laissent la sortie longue trop loin de la durée de course
 *   (sorties de 28 à 32 km chez Pfitzinger & Douglas, 2009, « Advanced
 *   Marathoning », cité de mémoire). Le plafond de 150 min reste appliqué.
 */
export function composerSemaine(c: ContexteSemaine): { jour: number; gabarit: Gabarit }[] {
  const nb = c.jours.length
  const nbQualite = nombreQualite(nb, c.phase, c.profil.anneesPratique)
  const types = choisirQualite(c.phase, c.rang, nbQualite, c.objectif, c.profil.anneesPratique)
  const qualites = types.map((t) => construireQualite(t, c.rang, c.volumeKm, c.allures, c.objectif))
  const kmQualite = qualites.reduce((s, g) => s + mesurerBlocs(g.blocs, c.allures).distanceKm, 0)

  const aSortieLongue = nb >= 2
  const nbFootings = nb - qualites.length - (aSortieLongue ? 1 : 0)
  const kmRestants = Math.max(c.volumeKm - kmQualite, 3 * (nbFootings + (aSortieLongue ? 1 : 0)))
  const kmMaxLongue = (150 * 60) / allureDeReference(c.allures, 'E')

  let kmLongue = 0
  if (aSortieLongue) {
    const part = distanceEffort(c.objectif) > 25000 ? 1 / 3 : c.volumeKm < 64 ? 0.3 : 0.25
    kmLongue = Math.max(part * c.volumeKm, (kmRestants / (nbFootings + 1)) * 1.25)
    kmLongue = Math.min(kmLongue, kmMaxLongue, kmRestants - 3 * nbFootings)
  }
  const kmFootingMax = (FOOTING_MAX_MIN * 60) / allureDeReference(c.allures, 'E')
  const kmFooting = nbFootings > 0 ? borner((kmRestants - kmLongue) / nbFootings, 3, kmFootingMax) : 0

  const jourLongue = aSortieLongue ? jourSortieLongue(c.jours) : -1
  const joursQualite = placerJoursDurs(c.jours, qualites.length, aSortieLongue ? [jourLongue] : [])
  const joursFooting = c.jours.filter((j) => j !== jourLongue && !joursQualite.includes(j))

  const resultat: { jour: number; gabarit: Gabarit }[] = []
  qualites.forEach((g, i) => resultat.push({ jour: joursQualite[i], gabarit: g }))
  if (aSortieLongue) resultat.push({ jour: jourLongue, gabarit: sortieLongue(kmLongue, c.objectif) })
  joursFooting.forEach((jour, i) => {
    // Lignes droites sur le premier footing, dès 3 sorties par semaine.
    const km = nb === 1 ? Math.min(c.volumeKm, kmMaxLongue) : kmFooting
    resultat.push({ jour, gabarit: footing(km, i === 0 && nb >= 3) })
  })
  return resultat.sort((a, b) => a.jour - b.jour)
}

// ───────────────────────── Programme débutant ─────────────────────────

// Progression marche-course vers 30 min de course continue, en 10 étapes.
// Construction d'entraîneur, dans l'esprit du programme public « Couch to
// 5K » du NHS britannique ; pas d'essai contrôlé derrière ces paliers.
// Chaque étape : [course (s), marche (s), répétitions].
const ETAPES_DEBUTANT: Bloc[][] = [
  [{ repetitions: 8, dureeS: 60, allure: 'aisance', recupS: 90, recupMode: 'marche' }],
  [{ repetitions: 6, dureeS: 90, allure: 'aisance', recupS: 120, recupMode: 'marche' }],
  [{ repetitions: 5, dureeS: 120, allure: 'aisance', recupS: 120, recupMode: 'marche' }],
  [{ repetitions: 4, dureeS: 180, allure: 'aisance', recupS: 120, recupMode: 'marche' }],
  [{ repetitions: 3, dureeS: 300, allure: 'aisance', recupS: 150, recupMode: 'marche' }],
  [{ repetitions: 2, dureeS: 480, allure: 'aisance', recupS: 180, recupMode: 'marche' }],
  [{ repetitions: 2, dureeS: 600, allure: 'aisance', recupS: 180, recupMode: 'marche' }],
  [
    { repetitions: 1, dureeS: 900, allure: 'aisance' },
    { repetitions: 1, dureeS: 120, allure: 'marche' },
    { repetitions: 1, dureeS: 600, allure: 'aisance' },
  ],
  [{ repetitions: 1, dureeS: 1500, allure: 'aisance' }],
  [{ repetitions: 1, dureeS: 1800, allure: 'aisance' }],
]

const MARCHE_5_MIN: Bloc = { repetitions: 1, dureeS: 300, allure: 'marche' }

function minutes(s: number): string {
  return s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)} min ${s % 60}`
}

function titreDebutant(blocs: Bloc[]): string {
  if (blocs.length > 1) return 'Course 15 min, marche 2 min, course 10 min'
  const b = blocs[0]
  if (b.repetitions === 1) return `Course continue : ${minutes(b.dureeS ?? 0)}`
  return `${b.repetitions} × (${minutes(b.dureeS ?? 0)} de course / ${minutes(b.recupS ?? 0)} de marche)`
}

/** Étape de la progression pour la semaine `rang` d'un programme de `nbSemaines`. */
export function etapeDebutant(rang: number, nbSemaines: number): number {
  const derniere = ETAPES_DEBUTANT.length - 1
  if (nbSemaines <= 1) return derniere
  return Math.min(derniere, Math.round((rang * derniere) / (nbSemaines - 1)))
}

function seanceDebutant(etape: number): Gabarit {
  const blocs = ETAPES_DEBUTANT[etape]
  return {
    type: 'marcheCourse',
    titre: titreDebutant(blocs),
    blocs: [MARCHE_5_MIN, ...blocs, MARCHE_5_MIN],
    consigne:
      'Commencez et terminez par 5 min de marche. Courez assez lentement pour pouvoir parler. Si une séance est trop dure, refaites la semaine précédente.',
  }
}

// ───────────────────────── Plan complet ─────────────────────────

export interface EntreePlan {
  id: string
  profil: Profil
  objectif: Objectif
  /** Niveau actuel ; null pour un débutant sans évaluation. */
  vdot: number | null
  dateDepart: DateIso
  /** Volume de départ, s'il doit différer de celui du profil (réajustement). */
  volumeDepartKm?: number
}

const JOURS_PAR_DEFAUT: JourSemaine[] = [1, 3, 6]

export function genererPlan(entree: EntreePlan): Plan {
  const { profil, objectif, dateDepart } = entree
  const premierLundi = lundiDe(dateDepart)
  const nbSemaines = joursEntre(premierLundi, lundiDe(objectif.date)) / 7 + 1
  if (joursEntre(dateDepart, objectif.date) < 0) throw new Error('La date de l’objectif est déjà passée.')
  if (nbSemaines > SEMAINES_MAX) {
    throw new Error(`L’objectif est à plus de ${SEMAINES_MAX} semaines. Choisissez d’abord un objectif intermédiaire.`)
  }

  const debutant = objectif.type === 'premier5k'
  const allures = entree.vdot !== null ? calculerAllures(entree.vdot) : null
  if (!debutant && !allures) throw new Error('Une évaluation est nécessaire pour construire ce plan.')

  const joursTries = [...(profil.joursDisponibles.length > 0 ? profil.joursDisponibles : JOURS_PAR_DEFAUT)].sort((a, b) => a - b)
  const avertissements = collecterAvertissements(entree, nbSemaines, debutant)

  const volumeDepart = Math.max(entree.volumeDepartKm ?? profil.volumeHebdoKm, 8)
  const phases: Phase[] = debutant ? Array<Phase>(nbSemaines).fill('debutant') : decouperPhases(nbSemaines)
  const volumes = debutant
    ? []
    : calculerVolumes(phases, volumeDepart, plafondVolume(distanceEffort(objectif), joursTries.length, volumeDepart))

  // Débutant : 3 séances au plus, espacées dans la semaine.
  const joursDebutant = placerJoursDurs(joursTries, Math.min(3, joursTries.length)).sort((a, b) => a - b)

  const semaines: SemainePlan[] = []
  for (let rang = 0; rang < nbSemaines; rang++) {
    const debut = ajouterJours(premierLundi, rang * 7)
    const derniere = rang === nbSemaines - 1
    const composition = debutant
      ? joursDebutant.map((jour) => ({ jour, gabarit: seanceDebutant(etapeDebutant(rang, nbSemaines)) }))
      : composerSemaine({
          phase: phases[rang],
          rang,
          volumeKm: volumes[rang].km,
          jours: joursTries,
          allures: allures!,
          objectif,
          profil,
        })

    const seances: SeancePrevue[] = []
    composition.forEach(({ jour, gabarit }, i) => {
      const date = ajouterJours(debut, jour)
      if (joursEntre(dateDepart, date) < 0) return // déjà passé
      if (derniere) {
        const avantCourse = joursEntre(date, objectif.date)
        if (avantCourse <= 0) return // jour de course ou après
        // Les deux derniers jours : rien de dur, seulement un court footing de mise en jambes.
        // Pratique d'entraîneur, cohérente avec la baisse de volume de Bosquet et al. (2007).
        if (avantCourse <= 2 && !debutant) gabarit = { ...footing(avantCourse === 1 ? 4 : 5, avantCourse === 1), titre: 'Footing de mise en jambes' }
      }
      seances.push(finaliser(gabarit, `${entree.id}-s${rang + 1}-${i + 1}`, date, allures))
    })
    if (derniere) seances.push(seanceCourse(objectif, `${entree.id}-course`, entree.vdot))

    semaines.push({
      numero: rang + 1,
      debut,
      phase: phases[rang],
      allegee: debutant ? false : volumes[rang].allegee,
      volumeKm: Math.round(seances.reduce((s, x) => s + x.distanceKm, 0)),
      seances,
    })
  }

  return {
    id: entree.id,
    version: VERSION_DONNEES,
    objectifId: objectif.id,
    creeLe: dateDepart,
    ...(entree.vdot !== null ? { vdotDepart: entree.vdot } : {}),
    semaines,
    avertissements,
  }
}

function collecterAvertissements(entree: EntreePlan, nbSemaines: number, debutant: boolean): string[] {
  const { profil, objectif } = entree
  const messages: string[] = []
  if (profil.blessures.trim() !== '') {
    messages.push('Vous avez signalé une blessure ou un antécédent : demandez l’avis d’un professionnel de santé avant d’augmenter la charge, et arrêtez-vous en cas de douleur.')
  }
  if (debutant && nbSemaines < 8) {
    messages.push(`Il reste ${nbSemaines} semaine(s) : c’est court pour passer de la marche à 5 km de course. Le programme a été compressé ; n’hésitez pas à repousser la date.`)
  }
  if (!debutant) {
    if (nbSemaines < 6) messages.push('Moins de 6 semaines : le plan entretient votre forme plus qu’il ne la développe.')
    // Seuils de 12 semaines et 30 km par semaine : repères d'entraîneur, sans source.
    if (distanceEffort(objectif) > 25000 && (profil.volumeHebdoKm < 30 || nbSemaines < 12)) {
      messages.push('Pour une distance aussi longue, on conseille au moins 12 semaines de préparation en partant d’environ 30 km par semaine. Visez de finir plutôt qu’un temps.')
    }
    if (profil.joursDisponibles.length === 0) messages.push('Aucun jour choisi dans le profil : le plan utilise mardi, jeudi et dimanche.')
  }
  return messages
}
