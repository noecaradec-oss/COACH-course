// Générateur de plan d'entraînement.
//
// Trois étages : la périodisation (phases), le volume de chaque semaine,
// puis le choix des séances dans la base (seances.ts) et leur placement. Les allures ne sont pas
// stockées dans le plan : chaque bloc porte un code d'allure, traduit en
// min/km à l'affichage avec le niveau du moment.

import { type DateIso, ajouterJours, joursEntre, lundiDe } from './dates'
import { distanceEquivalenteApprochee } from './denivele'
import type { AllureBloc, Bloc, JourSemaine, Objectif, Phase, Plan, Profil, SeancePrevue, SemainePlan } from './modele'
import { VERSION_DONNEES } from './modele'
import { placerJoursDurs } from './placement'
import { type Cible, type FicheSeance, type Niveau, SEANCES, type TypeFiche, blocsDe, fichesPour } from './seances'
import { type Allures, allureDeReference, calculerAllures, predireTemps } from './vdot'

export { placerJoursDurs }

// ───────────────────────── Estimation d'un bloc ─────────────────────────

// Repères d'allure quand le coureur n'a pas de niveau mesuré (débutant) :
// marche active à 10:00/km, course en aisance à 7:30/km. Ordres de grandeur
// d'entraîneur, sans source ; ils ne servent qu'à estimer distance et durée.
const ALLURE_MARCHE = 600
const ALLURE_DEBUTANT = 450

export function allureBloc(allure: AllureBloc, allures: Allures | null): number {
  if (allure === 'marche' || allure === 'exercice') return ALLURE_MARCHE
  if (allure === 'aisance' || allure === 'course') return allures ? allures.E.lente : ALLURE_DEBUTANT
  if (!allures) return ALLURE_DEBUTANT
  return allureDeReference(allures, allure)
}

/** Durée (s) et distance (m) d'un bloc, récupérations comprises. */
export function mesurerBloc(bloc: Bloc, allures: Allures | null): { dureeS: number; distanceM: number } {
  // Pas de récupération après la dernière répétition.
  const nbRecups = bloc.recupS ? bloc.repetitions - 1 : 0
  const dureeRecup = nbRecups * (bloc.recupS ?? 0)
  // Un exercice (renforcement, éducatifs, mobilité) prend du temps mais ne compte pas de kilomètres.
  if (bloc.allure === 'exercice') return { dureeS: bloc.repetitions * (bloc.dureeS ?? 0) + dureeRecup, distanceM: 0 }
  const allure = allureBloc(bloc.allure, allures)
  const dureeRep = bloc.dureeS ?? ((bloc.distanceM ?? 0) / 1000) * allure
  const distanceRep = bloc.distanceM ?? ((bloc.dureeS ?? 0) / allure) * 1000
  const distanceRecup =
    bloc.recupMode === 'arret' ? 0 : (dureeRecup / (bloc.recupMode === 'marche' ? ALLURE_MARCHE : allureBloc('aisance', allures))) * 1000
  return {
    dureeS: bloc.repetitions * dureeRep + dureeRecup,
    distanceM: bloc.repetitions * distanceRep + distanceRecup,
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

// Un plan couvre 24 semaines au plus : au-delà, mieux vaut un objectif
// intermédiaire (choix d'entraîneur). En dessous de 6 semaines le plan est
// généré avec un avertissement : il entretient plus qu'il ne développe.
export const SEMAINES_MAX = 24
export const SEMAINES_MIN_CONSEILLE = 6

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

// Hausse d'une semaine de charge à la suivante : +8 % visés, +10 % au
// maximum. Repère de prudence, nettement sous les +30 % sur deux semaines
// associés à plus de blessures chez les débutants (Nielsen et al., 2014).
// Aucune étude ne valide un taux précis : Buist et al. (2008) ne trouvent
// pas d'effet protecteur de la règle des « 10 % ». La hausse se mesure d'une
// semaine de charge à la suivante : la semaine qui suit une semaine allégée
// revient au niveau d'avant, plus la hausse.
const HAUSSE_HEBDO = 1.08
export const HAUSSE_MAX = 1.1

// Une semaine allégée (−25 %) toutes les 3 ou 4 semaines. Pratique
// d'entraîneur très répandue, sans preuve expérimentale directe ; elle
// s'appuie sur le modèle forme – fatigue de Banister et al. (1975) : la
// fatigue retombe plus vite que la forme, d'où l'intérêt de relâcher.
const FACTEUR_ALLEGEE = 0.75

/**
 * Longueur du cycle : 3 semaines (2 de charge, 1 allégée) pour les
 * débutants et à partir de 50 ans, 4 sinon. Choix d'entraîneur : on récupère
 * moins vite quand on débute ou qu'on vieillit.
 */
export function cycleAllegee(niveau: Niveau, age: number): 3 | 4 {
  return niveau === 1 || age >= 50 ? 3 : 4
}

// Affûtage : volume réduit de 41 à 60 %, de façon progressive, sans baisser
// l'intensité (Bosquet et al., 2007 ; Mujika & Padilla, 2003). On retient −42 % puis −58 % sur deux
// semaines, −50 % sur une seule.
const FACTEURS_AFFUTAGE_2 = [0.58, 0.42]
const FACTEURS_AFFUTAGE_1 = [0.5]

export interface VolumeSemaine {
  km: number
  allegee: boolean
}

export function calculerVolumes(
  phases: Phase[],
  volumeDepartKm: number,
  plafondKm: number,
  cycle: 3 | 4 = 4,
  premiereAllegee = false,
): VolumeSemaine[] {
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
    // Après un réajustement pour fatigue, le cycle repart par une semaine allégée.
    const decalage = premiereAllegee ? cycle - 1 : 0
    if ((rangCharge + decalage) % cycle === cycle - 1) {
      volumes.push({ km: arrondir(reference * FACTEUR_ALLEGEE), allegee: true })
    } else {
      if (rangCharge > (premiereAllegee ? 1 : 0)) reference = Math.min(reference * HAUSSE_HEBDO, plafondKm)
      volumes.push({ km: arrondir(reference), allegee: false })
    }
    rangCharge++
  }
  return volumes
}

function arrondir(km: number): number {
  return Math.round(km)
}

// ───────────────────────── Cible de la préparation ─────────────────────────

function borner(valeur: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valeur))
}

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

type Famille = 'demiFond' | 'cinqDix' | 'semi' | 'marathon'

/** Famille de distance : elle décide des séances de la phase spécifique. */
export function familleDe(objectif: Objectif): Famille {
  const d = distanceEffort(objectif)
  if (d <= 3000) return 'demiFond'
  if (d <= 12000) return 'cinqDix'
  if (d <= 25000) return 'semi'
  return 'marathon'
}

// ───────────────────────── Séances de qualité ─────────────────────────

/**
 * Nombre de séances de qualité par semaine.
 * Seiler & Kjerland (2006) : environ 80 % de séances faciles. Donc une seule
 * séance de qualité jusqu'à 5 sorties par semaine ; deux à partir de 6, en
 * phase spécifique et hors niveau 1 (schéma de compétiteur, choix
 * d'entraîneur). Avec 2 sorties, aucune en phase foncière.
 */
export function nombreQualite(nbSeances: number, phase: Phase, niveau: Niveau): number {
  if (nbSeances <= 1) return 0
  if (nbSeances === 2) return phase === 'base' ? 0 : 1
  if (phase === 'specifique' && nbSeances >= 6 && niveau >= 2) return 2
  return 1
}

// Phase foncière : on alterne seuil, fartlek et côtes pour construire sans
// fatiguer (Bompa & Buzzichelli, 2018 : du général vers le spécifique).
const ROTATION_FONCIER: TypeFiche[] = ['fartlek', 'seuil', 'cotes', 'seuil']

// Phase spécifique : la séance principale (a) travaille l'intensité de la
// course visée, la secondaire (b) entretient l'autre filière. Accents par
// distance d'après Daniels (2014) ; rotations : choix d'entraîneur.
const ROTATION_SPECIFIQUE: Record<Famille, { a: TypeFiche[]; b: TypeFiche[] }> = {
  demiFond: { a: ['vitesse', 'vmaCourte'], b: ['vmaLongue', 'seuil'] },
  cinqDix: { a: ['vmaLongue', 'vmaCourte'], b: ['seuil'] },
  semi: { a: ['seuil', 'allureSpecifique'], b: ['vmaLongue', 'seuil'] },
  marathon: { a: ['allureSpecifique'], b: ['seuil'] },
}

/** Types des séances de qualité de la semaine `rang` (rang compté depuis le début du plan). */
export function typesQualite(phase: Phase, rang: number, nb: number, objectif: Objectif, profil: Profil): TypeFiche[] {
  if (nb === 0) return []
  if (phase === 'affutage') return ['affutage']
  // Sans côte à proximité, le fartlek remplace les côtes.
  const sansCote = (t: TypeFiche): TypeFiche => (t === 'cotes' && !profil.terrains.cotes ? 'fartlek' : t)
  if (phase === 'base') {
    const premier = sansCote(ROTATION_FONCIER[rang % ROTATION_FONCIER.length])
    return nb >= 2 ? [premier, sansCote(ROTATION_FONCIER[(rang + 1) % ROTATION_FONCIER.length])] : [premier]
  }
  const rotation = objectif.type === 'trail' ? { a: ['cotes' as TypeFiche], b: ['seuil' as TypeFiche] } : ROTATION_SPECIFIQUE[familleDe(objectif)]
  const a = sansCote(rotation.a[Math.floor(rang / 2) % rotation.a.length])
  const b = sansCote(rotation.b[Math.floor(rang / 2) % rotation.b.length])
  if (nb >= 2) return a === b ? [a, 'fartlek'] : [a, b]
  // Une seule séance : deux semaines sur trois pour la principale.
  return [rang % 3 === 2 ? b : a]
}

/**
 * La fiche respecte-t-elle les plafonds de Daniels (2014) pour ce volume
 * hebdomadaire ? Seuil : 10 % du kilométrage. Intervalles : 8 %, 10 km au
 * plus. Répétitions : 5 %, 8 km au plus. Allure marathon : 20 % (chiffre
 * cité de mémoire) et 110 min au plus.
 */
export function respectePlafonds(fiche: FicheSeance, volumeKm: number, allures: Allures): boolean {
  const km = { T: 0, I: 0, R: 0, M: 0 }
  let minutesM = 0
  for (const b of fiche.corps) {
    if (b.allure !== 'T' && b.allure !== 'I' && b.allure !== 'R' && b.allure !== 'M') continue
    const allure = allures[b.allure]
    const parRep = b.distanceM !== undefined ? b.distanceM / 1000 : (b.dureeS ?? 0) / allure
    km[b.allure] += b.repetitions * parRep
    if (b.allure === 'M') minutesM += (b.repetitions * parRep * allure) / 60
  }
  return km.T <= volumeKm * 0.1 && km.I <= Math.min(volumeKm * 0.08, 10) && km.R <= Math.min(volumeKm * 0.05, 8) && km.M <= volumeKm * 0.2 && minutesM <= 110
}

interface Choix {
  type: TypeFiche
  niveau: Niveau
  objectif: Objectif
  profil: Profil
  allures: Allures
  volumeKm: number
  /** Nombre de fois où ce type a déjà été programmé : fait avancer dans les fiches. */
  dejaFaites: number
  /** Semaine allégée : on prend la fiche la plus accessible. */
  allegee: boolean
  /** Durée maximale de la séance, en minutes, si le coureur en a fixé une. */
  dureeMaxMin?: number
}

/**
 * Choisit une fiche de qualité dans la base.
 * On part du niveau du coureur (un de moins en semaine allégée) et on descend d'un niveau tant qu'aucune
 * fiche ne tient dans les plafonds de volume et dans le temps disponible.
 * Les fiches sont rangées de la plus accessible à la plus exigeante : on
 * avance d'une fiche à chaque nouvelle séance du même type, puis on boucle.
 * Si rien ne convient, on prend la fiche la plus courte du niveau 1.
 */
export function choisirFiche(c: Choix): FicheSeance {
  const cible: Cible = c.objectif.type === 'trail' ? 'trail' : familleDe(c.objectif)
  // Semaine allégée : on part d'un niveau en dessous, pour que la séance de
  // qualité soit elle aussi plus légère (choix d'entraîneur).
  const depart = c.allegee ? Math.max(1, c.niveau - 1) : c.niveau
  for (let niveau = depart; niveau >= 1; niveau--) {
    const candidates = fichesPour({ type: c.type, niveau: niveau as Niveau, cible, piste: c.profil.terrains.piste })
      // En affûtage, les fiches « veille de course » sont placées à part.
      .filter((f) => !(f.type === 'affutage' && f.categorie === 'facile'))
      .filter((f) => respectePlafonds(f, c.volumeKm, c.allures))
      .filter((f) => c.dureeMaxMin === undefined || mesurerBlocs(blocsDe(f), c.allures).dureeMin <= c.dureeMaxMin)
    if (candidates.length > 0) return candidates[c.allegee ? 0 : c.dejaFaites % candidates.length]
  }
  const secours = SEANCES.filter((f) => f.type === c.type && f.niveau === 1 && !(f.type === 'affutage' && f.categorie === 'facile'))
  return [...secours].sort((a, b) => a.dureeMin - b.dureeMin)[0]
}

// ───────────────────────── Endurance : fiches à durée réglable ─────────────────────────

function dureeHorsCorpsS(fiche: FicheSeance, allures: Allures | null): number {
  return (
    [...fiche.echauffement, ...fiche.corps.slice(1), ...fiche.retourAuCalme].reduce((s, b) => s + mesurerBloc(b, allures).dureeS, 0)
  )
}

/**
 * Règle une fiche d'endurance ou de sortie longue sur une durée cible, dans
 * les bornes prévues par la fiche. Seul le premier bloc du corps change.
 */
export function reglerDuree(fiche: FicheSeance, minutesCible: number, allures: Allures | null): FicheSeance {
  if (!fiche.ajustable) return fiche
  const minutes = Math.round(borner(minutesCible, fiche.ajustable.minMin, fiche.ajustable.maxMin))
  const corpsS = Math.max(300, minutes * 60 - dureeHorsCorpsS(fiche, allures))
  return {
    ...fiche,
    titre: fiche.titre.replace(/\d+ min/, `${minutes} min`),
    dureeMin: minutes,
    corps: [{ ...fiche.corps[0], dureeS: Math.round(corpsS / 60) * 60 }, ...fiche.corps.slice(1)],
  }
}

/**
 * Fiche réglable du type demandé, au niveau le plus proche de celui du
 * coureur dont les bornes contiennent la durée cible.
 */
function ficheReglable(type: 'endurance' | 'sortieLongue', niveau: Niveau, minutes: number, avecLignesDroites: boolean): FicheSeance {
  const reglables = SEANCES.filter((f) => f.type === type && f.ajustable && f.titre.includes('lignes droites') === avecLignesDroites)
  const parNiveau = [niveau, niveau - 1, niveau - 2, niveau + 1, niveau + 2].filter((n) => n >= 1 && n <= 3)
  for (const n of parNiveau) {
    const f = reglables.find((x) => x.niveau === n && minutes >= x.ajustable!.minMin && minutes <= x.ajustable!.maxMin)
    if (f) return f
  }
  const duNiveau = reglables.find((x) => x.niveau === niveau) ?? reglables[0]
  // Pas de version « lignes droites » au niveau 1 : on retombe sur le footing simple.
  return duNiveau ?? ficheReglable(type, niveau, minutes, false)
}

// ───────────────────────── Assemblage d'une semaine ─────────────────────────

function jourSortieLongue(jours: number[], prefere: number | undefined): number {
  if (prefere !== undefined && jours.includes(prefere)) return prefere
  if (jours.includes(6)) return 6
  if (jours.includes(5)) return 5
  return jours[jours.length - 1]
}

// Footing plafonné à 75 min : au-delà, c'est une deuxième sortie longue.
// Choix d'entraîneur ; le volume de la semaine peut alors rester sous la cible.
const FOOTING_MAX_MIN = 75
const FOOTING_MIN_MIN = 20

export interface SeanceComposee {
  jour: number
  fiche: FicheSeance
  /** Renforcement ou éducatifs accolés à un footing. */
  complement?: FicheSeance
}

export interface ContexteSemaine {
  phase: Phase
  rang: number
  volumeKm: number
  allegee: boolean
  jours: number[]
  allures: Allures
  objectif: Objectif
  profil: Profil
  /** Nombre de séances déjà programmées par type, mis à jour au fil du plan. */
  compteurs: Partial<Record<TypeFiche, number>>
}

function kmDe(fiche: FicheSeance, allures: Allures): number {
  return mesurerBlocs(blocsDe(fiche), allures).distanceKm
}

/**
 * Compose les séances d'une semaine : qualité, sortie longue, footings,
 * puis renforcement et éducatifs accolés aux footings.
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
export function composerSemaine(c: ContexteSemaine): SeanceComposee[] {
  const nb = c.jours.length
  const niveau = c.profil.niveau
  const allureE = allureDeReference(c.allures, 'E')
  const minutesPourKm = (km: number) => (km * allureE) / 60
  const jourLongue = nb >= 2 ? jourSortieLongue(c.jours, c.profil.sortieLongueJour) : -1
  const dureeMaxSemaine = c.profil.dureeMaxSemaineMin

  // ── Qualité ──
  const types = typesQualite(c.phase, c.rang, nombreQualite(nb, c.phase, niveau), c.objectif, c.profil)
  const joursQualite = placerJoursDurs(c.jours, types.length, jourLongue >= 0 ? [jourLongue] : [])
  const qualites = types.slice(0, joursQualite.length).map((type) => {
    const fiche = choisirFiche({
      type,
      niveau,
      objectif: c.objectif,
      profil: c.profil,
      allures: c.allures,
      volumeKm: c.volumeKm,
      dejaFaites: c.compteurs[type] ?? 0,
      allegee: c.allegee,
      ...(dureeMaxSemaine !== undefined ? { dureeMaxMin: dureeMaxSemaine } : {}),
    })
    c.compteurs[type] = (c.compteurs[type] ?? 0) + 1
    return fiche
  })
  const kmQualite = qualites.reduce((s, f) => s + kmDe(f, c.allures), 0)

  // ── Sortie longue et footings ──
  const nbFootings = nb - qualites.length - (jourLongue >= 0 ? 1 : 0)
  const kmRestants = Math.max(c.volumeKm - kmQualite, 0)
  const resultat: SeanceComposee[] = qualites.map((fiche, i) => ({ jour: joursQualite[i], fiche }))

  let kmLongue = 0
  if (jourLongue >= 0) {
    const part = distanceEffort(c.objectif) > 25000 ? 1 / 3 : c.volumeKm < 64 ? 0.3 : 0.25
    const kmVises = Math.min(Math.max(part * c.volumeKm, (kmRestants / (nbFootings + 1)) * 1.25), kmRestants)
    const minutes = Math.min(minutesPourKm(kmVises), 150)
    const fiche = reglerDuree(ficheReglable('sortieLongue', niveau, minutes, false), minutes, c.allures)
    kmLongue = kmDe(fiche, c.allures)
    resultat.push({ jour: jourLongue, fiche })
  }

  const joursFooting = c.jours.filter((j) => j !== jourLongue && !joursQualite.includes(j))
  const maxFooting = Math.min(FOOTING_MAX_MIN, dureeMaxSemaine ?? FOOTING_MAX_MIN)
  const minutesFooting = borner(minutesPourKm((kmRestants - kmLongue) / Math.max(1, joursFooting.length)), FOOTING_MIN_MIN, maxFooting)
  joursFooting.forEach((jour, i) => {
    // Lignes droites sur le premier footing, dès 3 sorties par semaine (Daniels, 2014).
    const avecLignesDroites = i === 0 && nb >= 3 && niveau >= 2
    // Une seule sortie dans la semaine : elle porte tout le volume, dans la limite de la sortie longue.
    const minutes = nb === 1 ? Math.min(minutesPourKm(c.volumeKm), 150) : minutesFooting
    const type = nb === 1 && minutes > FOOTING_MAX_MIN ? 'sortieLongue' : 'endurance'
    resultat.push({ jour, fiche: reglerDuree(ficheReglable(type, niveau, minutes, avecLignesDroites), minutes, c.allures) })
  })

  ajouterComplements(resultat, c)
  return resultat.sort((a, b) => a.jour - b.jour)
}

/**
 * Renforcement et éducatifs : une fois par semaine chacun, accolés à un
 * footing (Blagrove et al., 2018, pour l'intérêt du renforcement ; les
 * éducatifs relèvent de la pratique). Pas de renforcement en affûtage, pour
 * arriver frais. Rien si la séance dépasserait le temps disponible.
 */
function ajouterComplements(seances: SeanceComposee[], c: ContexteSemaine): void {
  const footings = seances.filter((s) => s.fiche.type === 'endurance').sort((a, b) => a.jour - b.jour)
  const tientDansLeTemps = (s: SeanceComposee, complement: FicheSeance) =>
    c.profil.dureeMaxSemaineMin === undefined || s.fiche.dureeMin + complement.dureeMin <= c.profil.dureeMaxSemaineMin
  const accoler = (type: 'educatifs' | 'renfo', cible: SeanceComposee | undefined) => {
    if (!cible || cible.complement) return
    const fiches = fichesPour({ type, niveau: c.profil.niveau })
    const fiche = fiches[(c.compteurs[type] ?? 0) % fiches.length]
    if (!tientDansLeTemps(cible, fiche)) return
    cible.complement = fiche
    c.compteurs[type] = (c.compteurs[type] ?? 0) + 1
  }
  accoler('educatifs', footings[0])
  if (c.phase !== 'affutage') accoler('renfo', footings.length > 1 ? footings[footings.length - 1] : undefined)
}

// ───────────────────────── Des fiches aux séances datées ─────────────────────────

function versSeance(composee: SeanceComposee, id: string, date: DateIso, allures: Allures | null, consigneEnPlus = ''): SeancePrevue {
  const { fiche, complement } = composee
  const blocs = [...blocsDe(fiche), ...(complement ? complement.corps.map((b): Bloc => ({ ...b, partie: 'complement' })) : [])]
  const { dureeMin, distanceKm } = mesurerBlocs(blocs, allures)
  const suffixe = complement ? (complement.type === 'renfo' ? ' + renforcement' : ' + éducatifs') : ''
  return {
    id,
    date,
    type: fiche.type,
    titre: fiche.titre + suffixe,
    categorie: fiche.categorie,
    blocs,
    distanceKm,
    dureeMin,
    consigne: [fiche.objectif, complement ? `Puis ${complement.titre.toLowerCase()} : ${complement.objectif.toLowerCase()}` : '', consigneEnPlus].filter(Boolean).join(' '),
    rpeVise: fiche.rpeVise,
    ficheId: fiche.id,
  }
}

/** Consigne de dénivelé pour la sortie longue d'une préparation trail. */
function consigneTrail(seance: SeanceComposee, objectif: Objectif, allures: Allures): string {
  if (seance.fiche.type !== 'sortieLongue' || objectif.type !== 'trail' || !objectif.deniveleM || objectif.distanceM <= 0) return ''
  // Même densité de dénivelé que la course visée (spécificité : Bompa & Buzzichelli, 2018).
  const km = kmDe(seance.fiche, allures)
  const dPlus = Math.round(((objectif.deniveleM / objectif.distanceM) * km * 1000) / 50) * 50
  return dPlus > 0 ? `Cherchez un parcours avec environ ${dPlus} m de dénivelé positif ; marchez dans les fortes pentes.` : ''
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
    blocs: [{ repetitions: 1, distanceM: objectif.distanceM, allure: 'course', partie: 'corps' }],
    distanceKm,
    dureeMin: Math.round(dureeS / 60),
    consigne: 'C’est le jour J. Partez prudemment : le premier tiers doit sembler facile.',
    rpeVise: 9,
  }
}

/** Fiche « veille de course » du niveau, ou footing court l'avant-veille. */
function ficheAvantCourse(niveau: Niveau, joursAvant: number, allures: Allures): FicheSeance {
  if (joursAvant === 1) {
    const veille = SEANCES.find((f) => f.type === 'affutage' && f.categorie === 'facile' && f.niveau === niveau)
    if (veille) return veille
  }
  return reglerDuree(ficheReglable('endurance', niveau, 25, false), 25, allures)
}

// ───────────────────────── Programme débutant ─────────────────────────

// Les 10 étapes marche-course de la base, dans l'ordre : construction
// d'entraîneur, dans l'esprit du programme public « Couch to 5K » du NHS.
const ETAPES_DEBUTANT = SEANCES.filter((f) => f.type === 'marcheCourse')

/** Étape de la progression pour la semaine `rang` d'un programme de `nbSemaines`. */
export function etapeDebutant(rang: number, nbSemaines: number): number {
  const derniere = ETAPES_DEBUTANT.length - 1
  if (nbSemaines <= 1) return derniere
  return Math.min(derniere, Math.round((rang * derniere) / (nbSemaines - 1)))
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
  /** Commencer par une semaine allégée (réajustement pour fatigue). */
  premiereSemaineAllegee?: boolean
}

const JOURS_PAR_DEFAUT: JourSemaine[] = [1, 3, 6]

// Sous 15 km par semaine, les durées minimales des séances imposent un volume
// plancher : la limite de +10 % ne peut pas s'appliquer à la première semaine,
// et d'une fiche de qualité à l'autre l'écart peut la dépasser de 1 à 2 km.
const VOLUME_MIN_POUR_LIMITE = 15

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
  const age = Number(dateDepart.slice(0, 4)) - profil.anneeNaissance
  const phases: Phase[] = debutant ? Array<Phase>(nbSemaines).fill('debutant') : decouperPhases(nbSemaines)
  const volumes = debutant
    ? []
    : calculerVolumes(
        phases,
        volumeDepart,
        plafondVolume(distanceEffort(objectif), joursTries.length, volumeDepart),
        cycleAllegee(profil.niveau, age),
        entree.premiereSemaineAllegee === true,
      )

  // Débutant : 3 séances au plus, espacées dans la semaine.
  const joursDebutant = placerJoursDurs(joursTries, Math.min(3, joursTries.length)).sort((a, b) => a - b)
  const compteurs: Partial<Record<TypeFiche, number>> = {}
  // Volume réellement composé lors de la dernière semaine de charge : c'est
  // lui, et non la cible théorique, qui borne la hausse suivante.
  let derniereCharge = volumeDepart
  // Cible théorique de cette même semaine : quand le temps disponible plafonne
  // le volume réel, les semaines allégées et l'affûtage se calculent sur le
  // réel, sinon elles n'allégeraient rien.
  let derniereCibleCharge = volumeDepart

  const semaines: SemainePlan[] = []
  for (let rang = 0; rang < nbSemaines; rang++) {
    const debut = ajouterJours(premierLundi, rang * 7)
    const derniere = rang === nbSemaines - 1
    let composition: SeanceComposee[]
    if (debutant) {
      composition = joursDebutant.map((jour) => ({ jour, fiche: ETAPES_DEBUTANT[etapeDebutant(rang, nbSemaines)] }))
    } else {
      const { km, allegee } = volumes[rang]
      const enCharge = !allegee && phases[rang] !== 'affutage'
      const limite = rang === 0 && volumeDepart < VOLUME_MIN_POUR_LIMITE ? Infinity : derniereCharge * HAUSSE_MAX
      let cible = enCharge ? Math.min(km, limite) : km * Math.min(1, derniereCharge / derniereCibleCharge)
      composition = []
      // Les séances ont des durées minimales : si la semaine composée dépasse
      // la limite de +10 %, on recompose avec une cible réduite d'autant.
      for (let essai = 0; essai < 4; essai++) {
        const essaiCompteurs = { ...compteurs }
        composition = composerSemaine({ phase: phases[rang], rang, volumeKm: cible, allegee, jours: joursTries, allures: allures!, objectif, profil, compteurs: essaiCompteurs })
        // Les éducatifs accolés à un footing comportent un peu de course : ils comptent.
        const reel = composition.reduce((s, x) => s + kmDe(x.fiche, allures!) + (x.complement ? mesurerBlocs(x.complement.corps, allures).distanceKm : 0), 0)
        if (!enCharge || reel <= limite || essai === 3) {
          Object.assign(compteurs, essaiCompteurs)
          if (enCharge) {
            derniereCharge = reel
            derniereCibleCharge = km
          }
          break
        }
        cible -= reel - limite
      }
    }

    const seances: SeancePrevue[] = []
    composition.forEach((composee, i) => {
      const date = ajouterJours(debut, composee.jour)
      if (joursEntre(dateDepart, date) < 0) return // déjà passé
      let aProgrammer = composee
      if (derniere) {
        const avantCourse = joursEntre(date, objectif.date)
        if (avantCourse <= 0) return // jour de course ou après
        // Les deux derniers jours : rien de dur, seulement une mise en jambes.
        // Pratique d'entraîneur, cohérente avec la baisse de volume de Bosquet et al. (2007).
        if (avantCourse <= 2 && !debutant) aProgrammer = { jour: composee.jour, fiche: ficheAvantCourse(profil.niveau, avantCourse, allures!) }
      }
      const consigne = allures ? consigneTrail(aProgrammer, objectif, allures) : ''
      seances.push(versSeance(aProgrammer, `${entree.id}-s${rang + 1}-${i + 1}`, date, allures, consigne))
    })
    if (derniere) seances.push(seanceCourse(objectif, `${entree.id}-course`, entree.vdot))

    semaines.push({
      numero: rang + 1,
      debut,
      phase: phases[rang],
      allegee: debutant ? false : volumes[rang].allegee,
      volumeKm: Math.round(seances.reduce((s, x) => s + x.distanceKm, 0) * 10) / 10,
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
    ajustements: [],
  }
}

function collecterAvertissements(entree: EntreePlan, nbSemaines: number, debutant: boolean): string[] {
  const { profil, objectif } = entree
  const messages: string[] = []
  if (profil.alerteSante) {
    messages.push('Vous avez signalé un symptôme ou une contre-indication : consultez un médecin avant de suivre ce plan.')
  }
  if (profil.blessureRecente || profil.blessures.trim() !== '') {
    messages.push('Vous avez signalé une blessure ou un antécédent : demandez l’avis d’un professionnel de santé avant d’augmenter la charge, et arrêtez-vous en cas de douleur.')
  }
  if (debutant && nbSemaines < 8) {
    messages.push(`Il reste ${nbSemaines} semaine(s) : c’est court pour passer de la marche à 5 km de course. Le programme a été compressé ; n’hésitez pas à repousser la date.`)
  }
  if (!debutant) {
    if (nbSemaines < SEMAINES_MIN_CONSEILLE) messages.push('Moins de 6 semaines : le plan entretient votre forme plus qu’il ne la développe.')
    // Seuils de 12 semaines et 30 km par semaine : repères d'entraîneur, sans source.
    if (distanceEffort(objectif) > 25000 && (profil.volumeHebdoKm < 30 || nbSemaines < 12)) {
      messages.push('Pour une distance aussi longue, on conseille au moins 12 semaines de préparation en partant d’environ 30 km par semaine. Visez de finir plutôt qu’un temps.')
    }
    if (profil.joursDisponibles.length === 0) messages.push('Aucun jour choisi dans le profil : le plan utilise mardi, jeudi et dimanche.')
  }
  return messages
}
