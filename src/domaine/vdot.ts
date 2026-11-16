// Niveau de performance (VDOT), prédiction de temps et allures d'entraînement.
//
// Source du modèle : Daniels & Gilbert (1979), « Oxygen Power: Performance
// Tables for Distance Runners ». Les deux équations ci-dessous sont celles du
// livre, telles que reprises dans la littérature ; coefficients recoupés en
// ligne le 16/11/2026, pas contre le livre lui-même (non consultable).
//
// Le VDOT n'est pas un VO2max mesuré : c'est un VO2max « apparent », déduit
// d'une performance, qui intègre aussi l'économie de course.

/** Coût en oxygène (ml/kg/min) d'une vitesse en m/min. Daniels & Gilbert (1979). */
export function vo2DepuisVitesse(metresParMinute: number): number {
  return -4.6 + 0.182258 * metresParMinute + 0.000104 * metresParMinute ** 2
}

/** Inverse de vo2DepuisVitesse (racine positive du polynôme du second degré). */
export function vitesseDepuisVo2(vo2: number): number {
  const a = 0.000104
  const b = 0.182258
  const c = -4.6 - vo2
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
}

/** Fraction du VO2max soutenable pendant une durée en minutes. Daniels & Gilbert (1979). */
export function fractionVo2max(minutes: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes)
}

// Le modèle a été ajusté sur des courses d'environ 3 min 30 à 4 h.
// En dehors, on calcule quand même mais l'appli doit prévenir.
export const DUREE_MIN_VALIDE_S = 210
export const DUREE_MAX_VALIDE_S = 4 * 3600

export function dureeDansDomaineValide(dureeS: number): boolean {
  return dureeS >= DUREE_MIN_VALIDE_S && dureeS <= DUREE_MAX_VALIDE_S
}

/** VDOT d'une performance. Daniels & Gilbert (1979). */
export function calculerVdot(distanceM: number, dureeS: number): number {
  if (!(distanceM > 0) || !(dureeS > 0)) throw new Error('Distance et durée doivent être positives.')
  const minutes = dureeS / 60
  return vo2DepuisVitesse(distanceM / minutes) / fractionVo2max(minutes)
}

/**
 * Temps prédit (s) sur une distance pour un VDOT donné : on cherche la durée
 * qui redonne ce VDOT. Daniels & Gilbert (1979) ; résolution par dichotomie,
 * car l'équation n'a pas de solution directe.
 */
export function predireTemps(vdot: number, distanceM: number): number {
  // Bornes larges : de 36 km/h à 3 km/h.
  let rapide = distanceM / 10
  let lent = distanceM / (3 / 3.6)
  for (let i = 0; i < 60; i++) {
    const milieu = (rapide + lent) / 2
    // Plus on met de temps, plus le VDOT correspondant est faible.
    if (calculerVdot(distanceM, milieu) > vdot) rapide = milieu
    else lent = milieu
  }
  return (rapide + lent) / 2
}

/**
 * VMA estimée (km/h) : vitesse que le modèle prédit sur un effort de 6 minutes.
 *
 * Pourquoi 6 minutes : le temps de maintien à la vitesse de VO2max est
 * d'environ 6 min en moyenne (Billat & Koralsztein, 1996), et c'est la durée
 * du test demi-Cooper utilisé en France. Choix d'entraîneur : une VMA mesurée
 * par test progressif (VAMEVAL) peut différer de quelques dixièmes de km/h.
 */
export const DUREE_VMA_MIN = 6

export function vmaDepuisVdot(vdot: number): number {
  return (vitesseDepuisVo2(vdot * fractionVo2max(DUREE_VMA_MIN)) * 60) / 1000
}

export function vdotDepuisVma(vmaKmh: number): number {
  const distanceM = (vmaKmh * 1000 * DUREE_VMA_MIN) / 60
  return calculerVdot(distanceM, DUREE_VMA_MIN * 60)
}

export type CodeAllure = 'E' | 'M' | 'T' | 'I' | 'R'

export interface Allures {
  /** Endurance : fourchette, de la plus lente à la plus rapide (s/km). */
  E: { lente: number; rapide: number }
  /** Allure marathon (s/km). */
  M: number
  /** Seuil (s/km). */
  T: number
  /** Intervalles proches de VO2max (s/km). */
  I: number
  /** Répétitions courtes, plus vite que VO2max (s/km). */
  R: number
}

// Intensités des allures, en fraction du VDOT. Daniels (2014), « Daniels'
// Running Formula », 3e éd., donne : E 59–74 %, T 83–88 %, I 95–100 %,
// R 105–120 % du VO2max. Les valeurs retenues dans chaque fourchette
// (T 88 %, I 97,5 %, R 107 %) sont un choix d'entraîneur : elles redonnent
// les tables du livre à quelques secondes par km près (tables citées de
// mémoire, à recouper avec le livre).
const FRACTION_E_LENTE = 0.59
const FRACTION_E_RAPIDE = 0.74
const FRACTION_T = 0.88
const FRACTION_I = 0.975
const FRACTION_R = 1.07

function allureAFraction(vdot: number, fraction: number): number {
  return 60000 / vitesseDepuisVo2(vdot * fraction)
}

/** Allures d'entraînement (s/km) pour un VDOT. Daniels (2014). */
export function calculerAllures(vdot: number): Allures {
  return {
    E: { lente: allureAFraction(vdot, FRACTION_E_LENTE), rapide: allureAFraction(vdot, FRACTION_E_RAPIDE) },
    // L'allure marathon est celle du marathon prédit pour ce VDOT (Daniels, 2014).
    M: predireTemps(vdot, 42195) / 42.195,
    T: allureAFraction(vdot, FRACTION_T),
    I: allureAFraction(vdot, FRACTION_I),
    R: allureAFraction(vdot, FRACTION_R),
  }
}

/** Allure de référence d'un code (milieu de fourchette pour E), en s/km. */
export function allureDeReference(allures: Allures, code: CodeAllure): number {
  return code === 'E' ? (allures.E.lente + allures.E.rapide) / 2 : allures[code]
}

/**
 * Gain de VDOT raisonnable sur une préparation. Daniels (2014) conseille de ne
 * pas relever ses allures de plus d'un point de VDOT toutes les 4 à 6 semaines
 * sans nouvelle performance. Interprétation d'entraîneur : on en tire un ordre
 * de grandeur du progrès possible (1 point par 5 semaines), pas une promesse.
 */
export function gainVdotRaisonnable(semaines: number): number {
  return Math.max(0, semaines) / 5
}

export type Realisme = 'acquis' | 'realiste' | 'ambitieux' | 'peuRealiste'

export function evaluerRealisme(vdotActuel: number, vdotRequis: number, semaines: number): Realisme {
  const ecart = vdotRequis - vdotActuel
  if (ecart <= 0) return 'acquis'
  const gain = gainVdotRaisonnable(semaines)
  if (ecart <= gain) return 'realiste'
  if (ecart <= 2 * gain) return 'ambitieux'
  return 'peuRealiste'
}
