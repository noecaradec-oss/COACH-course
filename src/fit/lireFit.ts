// Lecture d'un fichier .fit avec le SDK officiel Garmin, puis résumé.
//
// On ne garde que le résumé et les tours : ni le fichier, ni les points
// seconde par seconde (décision validée, pour ne pas saturer le téléphone).
// Les points servent une seule fois, ici, à calculer le temps par zone, le
// TRIMP et la distance équivalente à plat.

import { Decoder, type FitMessages, Stream } from '@garmin/fitsdk'
import { trimp } from '../domaine/charge'
import { aujourdHui } from '../domaine/dates'
import { type Segment, distanceEquivalentePlat } from '../domaine/denivele'
import { fractionReserve, indiceZone } from '../domaine/fc'
import type { Activite, Sexe, Tour } from '../domaine/modele'

export class ErreurFit extends Error {}

/** Décode le fichier. Lève ErreurFit avec un message lisible par le coureur. */
export function decoderFit(contenu: ArrayBuffer): FitMessages {
  const decodeur = new Decoder(Stream.fromArrayBuffer(contenu))
  if (!decodeur.isFIT()) throw new ErreurFit('Ce fichier n’est pas un fichier .fit.')
  if (!decodeur.checkIntegrity()) throw new ErreurFit('Le fichier .fit est incomplet ou abîmé.')
  const { messages, errors } = decodeur.read()
  if (errors.length > 0) throw new ErreurFit('Le fichier .fit n’a pas pu être lu entièrement.')
  return messages
}

export interface ContexteCoureur {
  fcMax?: number
  fcRepos?: number
  sexe?: Sexe
}

export type ResumeFit = Omit<Activite, 'id' | 'version' | 'commentaire' | 'rpe' | 'seanceId' | 'nomFichier'>

// Au-delà de 10 s entre deux points, on considère que la montre était en
// pause : l'intervalle n'est pas compté. Seuil technique, pas une règle
// d'entraînement.
const PAUSE_S = 10

// La pente est calculée par tronçons d'au moins 100 m pour lisser le bruit
// de l'altitude GPS ou barométrique. Seuil technique.
const TRONCON_M = 100

// Dénivelé recalculé depuis les points quand le fichier ne le donne pas
// (cas des exports Strava) : on ne compte une montée ou une descente
// qu'au-delà de 3 m d'écart avec le dernier palier retenu, pour ne pas
// additionner le bruit de l'altitude. Seuil technique, pas une règle
// d'entraînement.
const SEUIL_DENIVELE_M = 3

// Certains logiciels (Strava notamment) ajoutent un dernier tour de moins
// d'une seconde. Sous 3 s, un tour n'est pas un vrai tour. Seuil technique.
const TOUR_MIN_S = 3

interface Point {
  t: number
  fc?: number
  distanceM?: number
  altitudeM?: number
}

function secondes(d: unknown): number | undefined {
  return d instanceof Date ? d.getTime() / 1000 : undefined
}

function arrondi(n: number | undefined): number | undefined {
  return n === undefined ? undefined : Math.round(n)
}

/** Résume les messages décodés. Fonction pure : testable sans fichier. */
export function resumerFit(messages: FitMessages, coureur: ContexteCoureur = {}): ResumeFit {
  const session = messages.sessionMesgs?.[0]
  const points: Point[] = []
  for (const r of messages.recordMesgs ?? []) {
    const t = secondes(r.timestamp)
    if (t === undefined) continue
    // Certains exports (Strava) ne donnent pas la distance des points, seulement la
    // vitesse : on cumule alors vitesse × temps, sans compter les pauses.
    const precedent = points.at(-1)
    const vitesse = r.enhancedSpeed ?? r.speed
    let distanceM = r.distance
    if (distanceM === undefined && vitesse !== undefined && precedent?.distanceM !== undefined) {
      const dt = t - precedent.t
      distanceM = precedent.distanceM + (dt > 0 && dt <= PAUSE_S ? vitesse * dt : 0)
    }
    points.push({ t, fc: r.heartRate, distanceM, altitudeM: r.enhancedAltitude ?? r.altitude })
  }

  const debut = session?.startTime instanceof Date ? session.startTime : points.length > 0 ? new Date(points[0].t * 1000) : undefined
  if (!debut) throw new ErreurFit('Ce fichier ne contient pas d’activité datée.')

  // Sans message de session (enregistrement interrompu), on retombe sur les points.
  const dernier = points.at(-1)
  const distanceM = session?.totalDistance ?? dernier?.distanceM ?? 0
  const dureeS = session?.totalTimerTime ?? session?.totalElapsedTime ?? (dernier ? dernier.t - points[0].t : 0)
  if (!(dureeS > 0)) throw new ErreurFit('Ce fichier ne contient pas de durée d’activité.')

  const tours: Tour[] = (messages.lapMesgs ?? [])
    .filter((l) => (l.totalTimerTime ?? 0) >= TOUR_MIN_S)
    .map((l) => {
      // Tour sans distance ni FC (exports Strava) : on les recalcule avec les points du tour.
      const debutTour = secondes(l.startTime)
      const finTour = secondes(l.timestamp)
      const duTour = debutTour !== undefined && finTour !== undefined ? points.filter((p) => p.t >= debutTour && p.t <= finTour) : []
      const distance = l.totalDistance ?? distanceEntre(duTour)
      const fc = l.avgHeartRate ?? moyenneFc(duTour)
      return {
        distanceM: Math.round(distance ?? 0),
        dureeS: Math.round(l.totalTimerTime ?? 0),
        ...(fc ? { fcMoy: Math.round(fc) } : {}),
      }
    })

  const resume: ResumeFit = {
    date: aujourdHui(debut),
    source: 'fit',
    distanceM: Math.round(distanceM),
    dureeS: Math.round(dureeS),
    tours,
  }
  const fcMoy = session?.avgHeartRate ?? moyenneFc(points)
  if (fcMoy) resume.fcMoy = Math.round(fcMoy)
  const fcMaxSeance = session?.maxHeartRate ?? maxFc(points)
  if (fcMaxSeance) resume.fcMax = fcMaxSeance
  const deniveles = session?.totalAscent === undefined ? denivelesDepuisPoints(points) : null
  const dPlus = arrondi(session?.totalAscent ?? deniveles?.plus)
  const dMoins = arrondi(session?.totalDescent ?? deniveles?.moins)
  if (dPlus !== undefined) resume.denivelePosM = dPlus
  if (dMoins !== undefined) resume.deniveleNegM = dMoins

  const parFc = analyserFc(points, coureur)
  if (parFc.tempsZonesS) resume.tempsZonesS = parFc.tempsZonesS
  if (parFc.trimp !== undefined) resume.trimp = parFc.trimp

  const equivalent = equivalentPlat(points)
  if (equivalent !== undefined) resume.distanceEquivPlatM = equivalent
  return resume
}

/** Distance parcourue entre le premier et le dernier point qui en portent une. */
function distanceEntre(points: Point[]): number | undefined {
  const avec = points.filter((p) => p.distanceM !== undefined)
  return avec.length >= 2 ? avec[avec.length - 1].distanceM! - avec[0].distanceM! : undefined
}

/** Dénivelés positif et négatif, avec un seuil d'hystérésis (voir SEUIL_DENIVELE_M). */
export function denivelesDepuisPoints(points: { altitudeM?: number }[]): { plus: number; moins: number } | null {
  const altitudes = points.map((p) => p.altitudeM).filter((a): a is number => a !== undefined)
  if (altitudes.length < 2) return null
  let palier = altitudes[0]
  let plus = 0
  let moins = 0
  for (const a of altitudes) {
    if (a - palier >= SEUIL_DENIVELE_M) {
      plus += a - palier
      palier = a
    } else if (palier - a >= SEUIL_DENIVELE_M) {
      moins += palier - a
      palier = a
    }
  }
  return { plus, moins }
}

function moyenneFc(points: Point[]): number | undefined {
  const fcs = points.map((p) => p.fc).filter((f): f is number => f !== undefined)
  return fcs.length > 0 ? fcs.reduce((s, f) => s + f, 0) / fcs.length : undefined
}

function maxFc(points: Point[]): number | undefined {
  const fcs = points.map((p) => p.fc).filter((f): f is number => f !== undefined)
  return fcs.length > 0 ? Math.max(...fcs) : undefined
}

/**
 * Temps par zone (Seiler, 2010) et TRIMP (Banister, 1991), point par point.
 * Banister appliquait sa formule à la FC moyenne de la séance ; la sommer
 * intervalle par intervalle pèse mieux les séances fractionnées, où la
 * moyenne écrase les pics. Il faut FC max, FC de repos et sexe pour le TRIMP.
 */
function analyserFc(points: Point[], coureur: ContexteCoureur): { tempsZonesS?: number[]; trimp?: number } {
  if (!coureur.fcMax) return {}
  const zones = [0, 0, 0, 0, 0]
  const trimpPossible = coureur.fcRepos !== undefined && coureur.sexe !== undefined && coureur.fcMax > coureur.fcRepos
  let total = 0
  let vu = false
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t
    const fc = points[i].fc
    if (fc === undefined || dt <= 0 || dt > PAUSE_S) continue
    vu = true
    zones[indiceZone(fc, coureur.fcMax)] += dt
    if (trimpPossible) total += trimp(dt / 60, fractionReserve(fc, coureur.fcRepos!, coureur.fcMax), coureur.sexe!)
  }
  if (!vu) return {}
  return { tempsZonesS: zones.map(Math.round), ...(trimpPossible ? { trimp: Math.round(total) } : {}) }
}

/** Distance équivalente à plat (Minetti et al., 2002) à partir du profil enregistré. */
function equivalentPlat(points: Point[]): number | undefined {
  const profil = points.filter((p) => p.distanceM !== undefined && p.altitudeM !== undefined)
  if (profil.length < 2) return undefined
  const segments: Segment[] = []
  let depart = profil[0]
  for (const p of profil) {
    if (p.distanceM! - depart.distanceM! >= TRONCON_M) {
      segments.push({ distanceM: p.distanceM! - depart.distanceM!, deniveleM: p.altitudeM! - depart.altitudeM! })
      depart = p
    }
  }
  const fin = profil[profil.length - 1]
  if (fin.distanceM! > depart.distanceM!) {
    segments.push({ distanceM: fin.distanceM! - depart.distanceM!, deniveleM: fin.altitudeM! - depart.altitudeM! })
  }
  return segments.length > 0 ? Math.round(distanceEquivalentePlat(segments)) : undefined
}

/** Lit un fichier choisi par le coureur. */
export async function lireFichierFit(fichier: File, coureur: ContexteCoureur): Promise<ResumeFit> {
  return resumerFit(decoderFit(await fichier.arrayBuffer()), coureur)
}
