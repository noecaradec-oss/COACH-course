// Fabrique la base de séances : src/donnees/seances.json
//
//   node scripts/generer-seances.mjs
//
// Les fiches sont écrites à la main ci-dessous, en notation courte ; le
// script ajoute ce qui se déduit (identifiant, durée estimée, zones,
// variantes par défaut, source du type). Le fichier JSON produit est celui
// que lit le moteur ; un test vérifie sa cohérence (src/donnees/seances.test.ts).

import { writeFileSync } from 'node:fs'

// ─────────────── Sources, par type de séance ───────────────
const SOURCES = {
  endurance: 'Seiler & Kjerland, 2006 ; Daniels, 2014 (allure E)',
  sortieLongue: 'Daniels, 2014 (sortie longue : 25 à 30 % du volume, 150 min au plus)',
  seuil: 'Daniels, 2014 (allure T, fractions de 5 à 15 min)',
  allureSpecifique: 'Daniels, 2014 (allure M) ; Bompa & Buzzichelli, 2018 (spécificité)',
  vmaLongue: 'Daniels, 2014 (allure I, efforts de 5 min au plus) ; Billat, 2001',
  vmaCourte: 'Billat, 2001 (30 s – 30 s à la vitesse de VO2max)',
  vitesse: 'Daniels, 2014 (allure R, récupération complète)',
  cotes: 'Barnes et al., 2013 (intervalles en côte et économie de course)',
  fartlek: 'Holmér, 1937 (fartlek suédois) ; pratique d’entraîneur',
  renfo: 'Blagrove, Howatson & Hayes, 2018 (renforcement et économie de course)',
  educatifs: 'Pratique d’entraîneur, sans preuve expérimentale solide',
  recuperation: 'Seiler, 2010 (zone 1) ; Barnett, 2006 (récupération entre séances)',
  marcheCourse: 'Pratique d’entraîneur, dans l’esprit du programme Couch to 5K (NHS)',
  affutage: 'Bosquet et al., 2007 ; Mujika & Padilla, 2003 (volume réduit, intensité maintenue)',
}

// Phases où chaque type est utilisable, et distances préparées concernées.
const USAGE = {
  endurance: { phases: ['base', 'specifique', 'affutage'], pour: ['tous'] },
  sortieLongue: { phases: ['base', 'specifique'], pour: ['tous'] },
  seuil: { phases: ['base', 'specifique'], pour: ['tous'] },
  allureSpecifique: { phases: ['specifique'], pour: ['semi', 'marathon'] },
  vmaLongue: { phases: ['specifique'], pour: ['demiFond', 'cinqDix', 'semi'] },
  vmaCourte: { phases: ['base', 'specifique'], pour: ['demiFond', 'cinqDix'] },
  vitesse: { phases: ['specifique'], pour: ['demiFond', 'cinqDix'] },
  cotes: { phases: ['base', 'specifique'], pour: ['tous'] },
  fartlek: { phases: ['base'], pour: ['tous'] },
  renfo: { phases: ['base', 'specifique'], pour: ['tous'] },
  educatifs: { phases: ['base', 'specifique', 'affutage'], pour: ['tous'] },
  recuperation: { phases: ['base', 'specifique', 'affutage'], pour: ['tous'] },
  marcheCourse: { phases: ['debutant'], pour: ['debutant'] },
  affutage: { phases: ['affutage'], pour: ['tous'] },
}

const CATEGORIE = {
  endurance: 'facile', sortieLongue: 'facile', recuperation: 'facile', renfo: 'facile', educatifs: 'facile', marcheCourse: 'facile',
  seuil: 'seuil', allureSpecifique: 'seuil',
  vmaLongue: 'intense', vmaCourte: 'intense', vitesse: 'intense', cotes: 'intense', fartlek: 'intense', affutage: 'intense',
}

// Ressenti visé par défaut (échelle 1–10 de Foster et al., 2001).
const RPE = {
  endurance: 3, sortieLongue: 4, recuperation: 2, renfo: 5, educatifs: 3, marcheCourse: 4,
  seuil: 6, allureSpecifique: 5, vmaLongue: 8, vmaCourte: 8, vitesse: 7, cotes: 8, fartlek: 6, affutage: 5,
}

// Zone cardiaque associée à chaque allure (échelle à 5 zones, Seiler, 2010).
// Correspondance d'entraîneur : sur les efforts courts la FC n'a pas le
// temps de monter, la zone indique l'intensité visée, pas la FC lue.
const ZONE = { marche: 1, aisance: 1, E: 2, M: 3, T: 3, I: 4, R: 5 }

// Allures de référence (s/km) pour estimer les durées : VDOT 32, 45 et 56
// selon le niveau. Colonnes : aisance, E, M, T, I, R. Calculées par
// src/domaine/vdot.ts ; le test de la base vérifie qu'elles concordent.
const ALLURES_REF = {
  1: { aisance: 498, E: 458, M: 391, T: 365, I: 337, R: 312, marche: 600 },
  2: { aisance: 382, E: 351, M: 296, T: 278, I: 256, R: 237, marche: 600 },
  3: { aisance: 321, E: 295, M: 246, T: 233, I: 214, R: 199, marche: 600 },
}

// ─────────────── Notation courte des blocs ───────────────
/** Bloc au temps : t(répétitions, secondes, allure, récup en s, mode de récup, précision). */
function t(repetitions, dureeS, allure, recupS = 0, recupMode = 'trot', libelle) {
  return bloc({ repetitions, dureeS, allure }, recupS, recupMode, libelle)
}
/** Bloc à la distance : d(répétitions, mètres, allure, récup en s, mode, précision). */
function d(repetitions, distanceM, allure, recupS = 0, recupMode = 'trot', libelle) {
  return bloc({ repetitions, distanceM, allure }, recupS, recupMode, libelle)
}
/** Exercice sans course : x(séries, secondes par série, description, récup en s). */
function x(repetitions, dureeS, libelle, recupS = 0) {
  return bloc({ repetitions, dureeS, allure: 'exercice' }, recupS, 'arret', libelle)
}
function bloc(base, recupS, recupMode, libelle) {
  const b = { ...base }
  if (ZONE[b.allure]) b.zone = ZONE[b.allure]
  if (recupS > 0) Object.assign(b, { recupS, recupMode })
  if (libelle) b.libelle = libelle
  return b
}
const min = (n) => Math.round(n * 60)

// Échauffements et retours au calme types, par niveau.
const LD = (n) => t(n, 20, 'R', 60, 'trot', 'Lignes droites progressives')
const echQualite = (niv) => [t(1, [600, 900, 1200][niv - 1], 'E'), LD([3, 4, 5][niv - 1])]
const retourQualite = (niv) => [t(1, [300, 600, 600][niv - 1], 'E')]
// Footings : le titre annonce la durée totale, mise en route et retour au calme compris.
const echFooting = () => [t(1, 120, 'aisance', 0, 'trot', 'Départ très lent')]
const retourFooting = () => [t(1, 180, 'aisance', 0, 'trot', 'Dernières minutes très lentes')]
const echMarche = () => [t(1, 300, 'marche', 0, 'marche', 'Marche active')]

// ─────────────── Durées et variantes ───────────────
function dureeBlocS(b, niv) {
  const allure = ALLURES_REF[niv][b.allure]
  const effort = b.dureeS ?? (b.distanceM / 1000) * allure
  return b.repetitions * effort + (b.recupS ? (b.repetitions - 1) * b.recupS : 0)
}
function texteDuree(s) {
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return s % 60 === 0 ? `${m} min` : `${m} min ${s % 60}`
}
function texteEffort(b, facteur = 1) {
  if (b.dureeS !== undefined) {
    const s = b.dureeS * facteur
    return texteDuree(s >= 300 ? Math.round(s / 60) * 60 : Math.round(s / 5) * 5)
  }
  const m = Math.round((b.distanceM * facteur) / 100) * 100
  return m >= 1000 ? `${String(m / 1000).replace('.', ',')} km` : `${m} m`
}
/** Variantes par défaut, déduites du bloc principal (le plus long du corps). */
function variantesParDefaut(corps, niv) {
  const principal = [...corps].sort((a, b) => dureeBlocS(b, niv) - dureeBlocS(a, niv))[0]
  if (principal.repetitions > 1) {
    const pas = principal.repetitions >= 8 ? 2 : 1
    const plusFacile = `${principal.repetitions - pas} répétitions au lieu de ${principal.repetitions}` + (principal.recupS ? `, ou ${texteDuree(principal.recupS + 30)} de récupération` : '')
    return { plusFacile: `${plusFacile}.`, plusDure: `${principal.repetitions + pas} répétitions, sans accélérer l’allure.` }
  }
  return {
    plusFacile: `${texteEffort(principal, 0.8)} au lieu de ${texteEffort(principal)}.`,
    plusDure: `${texteEffort(principal, 1.2)} au lieu de ${texteEffort(principal)}, à la même allure.`,
  }
}

// ─────────────── Les fiches ───────────────
const fiches = []
const compteurs = {}

/**
 * f(type, niveau, titre, objectif, corps, options)
 * options : ech, retour, rpe, categorie, facile, dure, ajustable [min, max], terrain, pour
 */
function f(type, niveau, titre, objectif, corps, o = {}) {
  const cle = `${type}-n${niveau}`
  compteurs[cle] = (compteurs[cle] ?? 0) + 1
  const qualite = ['seuil', 'allureSpecifique', 'vmaLongue', 'vmaCourte', 'vitesse', 'cotes', 'fartlek', 'affutage'].includes(type)
  const echauffement = o.ech ?? (qualite ? echQualite(niveau) : type === 'marcheCourse' ? echMarche() : type === 'renfo' ? [] : echFooting())
  const retourAuCalme = o.retour ?? (qualite ? retourQualite(niveau) : type === 'marcheCourse' ? echMarche() : type === 'renfo' ? [] : retourFooting())
  const dureeS = [...echauffement, ...corps, ...retourAuCalme].reduce((s, b) => s + dureeBlocS(b, niveau), 0)
  const defaut = variantesParDefaut(corps, niveau)
  const fiche = {
    id: `${cle}-${String(compteurs[cle]).padStart(2, '0')}`,
    type,
    niveau,
    titre,
    objectif,
    phases: USAGE[type].phases,
    pour: o.pour ?? USAGE[type].pour,
    categorie: o.categorie ?? CATEGORIE[type],
    echauffement,
    corps,
    retourAuCalme,
    rpeVise: o.rpe ?? RPE[type],
    dureeMin: Math.round(dureeS / 60),
    variantes: { plusFacile: o.facile ?? defaut.plusFacile, plusDure: o.dure ?? defaut.plusDure },
    source: SOURCES[type],
  }
  if (o.ajustable) fiche.ajustable = { minMin: o.ajustable[0], maxMin: o.ajustable[1] }
  if (o.terrain) fiche.terrain = o.terrain
  fiches.push(fiche)
}

// ── Endurance ──
const OBJ_E = 'Développer l’endurance de base sans fatigue : cœur, capillaires, tendons.'
f('endurance', 1, 'Footing 25 min', OBJ_E, [t(1, min(20), 'E')], { ajustable: [15, 40] })
f('endurance', 1, 'Footing 30 min avec pauses marchées', 'Allonger la durée en gardant une foulée propre grâce à de courtes pauses.', [t(3, min(9), 'E', 90, 'marche')], { ech: [], retour: [], facile: '3 × 7 min de course, 1 min de marche.', dure: '3 × 9 min sans pause marchée la fois suivante.' })
f('endurance', 1, 'Footing 40 min', 'Tenir 40 minutes en aisance respiratoire.', [t(1, min(35), 'E')])
f('endurance', 1, 'Footing vallonné 35 min', 'Renforcer les jambes sur un parcours à faibles bosses, sans chercher l’allure.', [t(1, min(30), 'E', 0, 'trot', 'Parcours vallonné, effort constant')], { rpe: 4 })
f('endurance', 2, 'Footing 45 min', OBJ_E, [t(1, min(40), 'E')], { ajustable: [30, 65] })
f('endurance', 2, 'Footing 55 min', 'Accumuler du volume facile.', [t(1, min(50), 'E')])
f('endurance', 2, 'Footing 45 min + 6 lignes droites', 'Entretenir la vitesse et la foulée après un footing.', [t(1, min(33), 'E'), t(6, 20, 'R', 60, 'trot', 'Lignes droites relâchées')], { ajustable: [30, 60], facile: '4 lignes droites.', dure: '8 lignes droites.' })
f('endurance', 2, 'Footing progressif 50 min', 'Apprendre à finir plus vite qu’on a commencé, en restant en endurance.', [t(1, min(35), 'E'), t(1, min(10), 'E', 0, 'trot', 'Haut de la fourchette d’endurance')], { rpe: 4 })
f('endurance', 2, 'Footing vallonné 50 min', 'Renforcement naturel et travail de pied sur terrain varié.', [t(1, min(45), 'E', 0, 'trot', 'Parcours vallonné, effort constant')], { rpe: 4 })
f('endurance', 3, 'Footing 60 min', OBJ_E, [t(1, min(55), 'E')], { ajustable: [40, 75] })
f('endurance', 3, 'Footing 70 min', 'Accumuler du volume facile en semaine.', [t(1, min(65), 'E')])
f('endurance', 3, 'Footing 60 min + 8 lignes droites', 'Entretenir la vitesse et la foulée après un footing.', [t(1, min(45), 'E'), t(8, 20, 'R', 60, 'trot', 'Lignes droites relâchées')], { ajustable: [40, 70], facile: '6 lignes droites.', dure: '10 lignes droites.' })
f('endurance', 3, 'Footing progressif 65 min', 'Finir en haut de la zone d’endurance sans basculer au seuil.', [t(1, min(45), 'E'), t(1, min(15), 'E', 0, 'trot', 'Haut de la fourchette d’endurance')], { rpe: 4 })
f('endurance', 3, 'Second footing du jour 35 min', 'Ajouter du volume sans allonger les sorties (bi-quotidien).', [t(1, min(30), 'E')], { rpe: 2 })

// ── Sortie longue ──
f('sortieLongue', 1, 'Sortie longue 50 min', 'Habituer le corps à durer.', [t(1, min(45), 'E')], { ajustable: [40, 80] })
f('sortieLongue', 1, 'Sortie longue 60 min', 'Passer le cap de l’heure de course.', [t(1, min(55), 'E')])
f('sortieLongue', 1, 'Sortie longue 70 min avec pauses marchées', 'Allonger la durée en limitant les chocs.', [t(4, min(16), 'E', 60, 'marche')], { ech: [], facile: '3 × 16 min.', dure: '4 × 16 min sans marcher la fois suivante.' })
f('sortieLongue', 1, 'Sortie longue 75 min', 'Construire l’endurance pour un 10 km ou un semi.', [t(1, min(70), 'E')], { rpe: 5 })
f('sortieLongue', 2, 'Sortie longue 80 min', 'Développer l’endurance et l’usage des graisses.', [t(1, min(75), 'E')], { ajustable: [60, 120] })
f('sortieLongue', 2, 'Sortie longue vallonnée 90 min', 'Endurance et renforcement sur terrain bosselé.', [t(1, min(85), 'E', 0, 'trot', 'Parcours vallonné, marche autorisée dans les fortes pentes')], { rpe: 5 })
f('sortieLongue', 2, 'Sortie longue 100 min, fin à allure marathon', 'Courir vite sur des jambes fatiguées.', [t(1, min(80), 'E'), t(1, min(15), 'M')], { rpe: 5, categorie: 'seuil', pour: ['semi', 'marathon'], facile: '10 min à allure marathon.', dure: '20 min à allure marathon.' })
f('sortieLongue', 2, 'Sortie longue 105 min', 'Préparer la durée d’un semi-marathon.', [t(1, min(100), 'E')], { rpe: 5 })
f('sortieLongue', 3, 'Sortie longue 110 min', 'Développer l’endurance et l’usage des graisses.', [t(1, min(105), 'E')], { ajustable: [90, 150] })
f('sortieLongue', 3, 'Sortie longue 120 min avec 3 × 15 min allure marathon', 'Travailler l’allure de course dans la durée.', [t(1, min(45), 'E'), t(3, min(15), 'M', 300), t(1, min(15), 'E')], { rpe: 6, categorie: 'seuil', pour: ['marathon'] })
f('sortieLongue', 3, 'Sortie longue 135 min', 'S’approcher de la durée du marathon.', [t(1, min(130), 'E')], { rpe: 5, pour: ['marathon', 'trail'] })
f('sortieLongue', 3, 'Sortie longue progressive 120 min', 'Trois tiers de plus en plus rapides, sans dépasser l’allure marathon.', [t(1, min(45), 'E'), t(1, min(40), 'E', 0, 'trot', 'Haut de la fourchette d’endurance'), t(1, min(30), 'M')], { rpe: 6, categorie: 'seuil', pour: ['semi', 'marathon'], facile: 'Dernier tiers de 20 min.', dure: 'Dernier tiers de 40 min.' })
f('sortieLongue', 3, 'Sortie longue trail 150 min', 'Durée et dénivelé : gérer l’effort en montée, relâcher en descente.', [t(1, min(145), 'E', 0, 'trot', 'Sentier avec dénivelé, marche dans les fortes pentes')], { rpe: 6, pour: ['trail'] })

// ── Seuil ──
const OBJ_T = 'Repousser le seuil : tenir une allure soutenue plus longtemps.'
f('seuil', 1, 'Seuil 3 × 5 min', 'Découvrir l’allure seuil : soutenue mais maîtrisée.', [t(3, min(5), 'T', 60)])
f('seuil', 1, 'Seuil 4 × 5 min', OBJ_T, [t(4, min(5), 'T', 60)])
f('seuil', 1, 'Seuil 2 × 8 min', 'Allonger les fractions au seuil.', [t(2, min(8), 'T', 120)])
f('seuil', 1, 'Seuil 15 min en continu', 'Tenir le seuil sans pause.', [t(1, min(15), 'T')])
f('seuil', 2, 'Seuil 4 × 6 min', OBJ_T, [t(4, min(6), 'T', 75)])
f('seuil', 2, 'Seuil 3 × 8 min', OBJ_T, [t(3, min(8), 'T', 90)])
f('seuil', 2, 'Seuil 5 × 6 min', 'Augmenter le temps total au seuil.', [t(5, min(6), 'T', 60)])
f('seuil', 2, 'Seuil 20 min en continu', 'Le tempo classique de Daniels : 20 minutes régulières.', [t(1, min(20), 'T')])
f('seuil', 2, 'Seuil 2 × 12 min', 'Fractions longues, concentration sur la régularité.', [t(2, min(12), 'T', 120)])
f('seuil', 3, 'Seuil 3 × 10 min', OBJ_T, [t(3, min(10), 'T', 120)])
f('seuil', 3, 'Seuil 4 × 8 min', OBJ_T, [t(4, min(8), 'T', 90)])
f('seuil', 3, 'Seuil 6 × 6 min', 'Gros volume au seuil avec récupérations courtes.', [t(6, min(6), 'T', 60)])
f('seuil', 3, 'Seuil 2 × 15 min', 'Fractions longues proches de l’effort d’un semi.', [t(2, min(15), 'T', 180)])
f('seuil', 3, 'Seuil 25 min en continu', 'Tempo long, mental de course.', [t(1, min(25), 'T')], { rpe: 7 })
f('seuil', 3, 'Seuil 5 × 8 min', 'Séance lourde de phase spécifique semi et marathon.', [t(5, min(8), 'T', 90)], { rpe: 7, pour: ['semi', 'marathon'] })

// ── Allure spécifique ──
const OBJ_M = 'Mémoriser l’allure de course et l’économie à cette allure.'
f('allureSpecifique', 1, 'Allure marathon 2 × 10 min', 'Découvrir l’allure de course sur des fractions courtes.', [t(2, min(10), 'M', 180)])
f('allureSpecifique', 1, 'Allure marathon 20 min', OBJ_M, [t(1, min(20), 'M')])
f('allureSpecifique', 1, 'Allure marathon 3 × 8 min', OBJ_M, [t(3, min(8), 'M', 120)])
f('allureSpecifique', 1, 'Allure marathon 25 min', 'Tenir l’allure de course sans à-coups.', [t(1, min(25), 'M')])
f('allureSpecifique', 2, 'Allure marathon 8 km', OBJ_M, [d(1, 8000, 'M')])
f('allureSpecifique', 2, 'Allure marathon 2 × 20 min', OBJ_M, [t(2, min(20), 'M', 180)])
f('allureSpecifique', 2, 'Allure marathon 10 km', 'Répéter le ravitaillement à allure de course.', [d(1, 10000, 'M')], { rpe: 6 })
f('allureSpecifique', 2, 'Allure marathon 3 × 15 min', OBJ_M, [t(3, min(15), 'M', 120)])
f('allureSpecifique', 3, 'Allure marathon 14 km', OBJ_M, [d(1, 14000, 'M')], { rpe: 6 })
f('allureSpecifique', 3, 'Allure marathon 16 km', 'La séance clé du marathonien, 4 à 6 semaines avant la course.', [d(1, 16000, 'M')], { rpe: 7, pour: ['marathon'] })
f('allureSpecifique', 3, 'Allure marathon 2 × 8 km', OBJ_M, [d(2, 8000, 'M', 300)], { rpe: 7, pour: ['marathon'] })
f('allureSpecifique', 3, 'Allure marathon 3 × 5 km', OBJ_M, [d(3, 5000, 'M', 180)], { rpe: 6 })
f('allureSpecifique', 3, 'Seuil 20 min puis allure marathon 30 min', 'Courir à l’allure de course avec une fatigue préalable.', [t(1, min(20), 'T'), t(1, min(5), 'E'), t(1, min(30), 'M')], { rpe: 7, facile: '15 min au seuil puis 20 min à allure marathon.', dure: '20 min au seuil puis 40 min à allure marathon.' })

// ── VMA longue ──
const OBJ_I = 'Développer VO2max : passer du temps près de la consommation maximale d’oxygène.'
f('vmaLongue', 1, 'Intervalles 4 × 2 min', 'Découvrir l’effort d’intervalles : dur mais régulier.', [t(4, min(2), 'I', 120)])
f('vmaLongue', 1, 'Intervalles 5 × 2 min', OBJ_I, [t(5, min(2), 'I', 120)])
f('vmaLongue', 1, 'Intervalles 3 × 3 min', 'Allonger les efforts à VO2max.', [t(3, min(3), 'I', 180)])
f('vmaLongue', 1, 'Intervalles 6 × 400 m', 'Travailler l’allure sur piste, avec un repère de distance.', [d(6, 400, 'I', 90)], { terrain: 'piste' })
f('vmaLongue', 2, 'Intervalles 5 × 3 min', OBJ_I, [t(5, min(3), 'I', 120)])
f('vmaLongue', 2, 'Intervalles 6 × 800 m', OBJ_I, [d(6, 800, 'I', 150)], { terrain: 'piste' })
f('vmaLongue', 2, 'Intervalles 5 × 1000 m', 'La séance de référence du coureur de 10 km.', [d(5, 1000, 'I', 180)], { terrain: 'piste' })
f('vmaLongue', 2, 'Intervalles 4 × 4 min', 'Efforts longs à VO2max.', [t(4, min(4), 'I', 180)])
f('vmaLongue', 2, 'Intervalles 8 × 2 min', 'Beaucoup de relances, récupération courte.', [t(8, min(2), 'I', 90)])
f('vmaLongue', 3, 'Intervalles 6 × 1000 m', OBJ_I, [d(6, 1000, 'I', 150)], { terrain: 'piste' })
f('vmaLongue', 3, 'Intervalles 5 × 1200 m', 'Efforts longs proches de l’allure 5 km.', [d(5, 1200, 'I', 180)], { terrain: 'piste' })
f('vmaLongue', 3, 'Intervalles 4 × 5 min', 'La durée maximale utile à cette intensité (Daniels).', [t(4, min(5), 'I', 180)], { rpe: 9 })
f('vmaLongue', 3, 'Intervalles 8 × 800 m', OBJ_I, [d(8, 800, 'I', 120)], { terrain: 'piste' })
f('vmaLongue', 3, 'Intervalles 6 × 3 min, récupération courte', 'Rester haut en oxygène grâce à une récupération réduite.', [t(6, min(3), 'I', 90)], { rpe: 9 })
f('vmaLongue', 3, 'Pyramide 2-3-4-3-2 min', 'Varier les durées pour casser la routine.', [t(1, min(2), 'I'), t(1, min(2), 'E'), t(1, min(3), 'I'), t(1, min(2), 'E'), t(1, min(4), 'I'), t(1, min(3), 'E'), t(1, min(3), 'I'), t(1, min(2), 'E'), t(1, min(2), 'I')], { facile: 'Pyramide 2-3-2 min.', dure: 'Pyramide 2-3-4-4-3-2 min.' })

// ── VMA courte ──
const OBJ_30 = 'Solliciter VO2max avec peu de fatigue musculaire, grâce à des efforts très courts.'
const pause3 = () => t(1, 180, 'E', 0, 'trot', 'Trot entre les séries')
f('vmaCourte', 1, 'VMA 8 × 30 s / 30 s', 'Découvrir le 30-30 de Billat.', [t(8, 30, 'I', 30)])
f('vmaCourte', 1, 'VMA 2 × (6 × 30 s / 30 s)', OBJ_30, [t(6, 30, 'I', 30), pause3(), t(6, 30, 'I', 30)], { facile: '2 × (5 × 30 s / 30 s).', dure: '2 × (8 × 30 s / 30 s).' })
f('vmaCourte', 1, 'VMA 10 × 30 s / 30 s', OBJ_30, [t(10, 30, 'I', 30)])
f('vmaCourte', 1, 'VMA 6 × 45 s / 45 s', 'Allonger légèrement l’effort.', [t(6, 45, 'I', 45)])
f('vmaCourte', 2, 'VMA 2 × (8 × 30 s / 30 s)', OBJ_30, [t(8, 30, 'I', 30), pause3(), t(8, 30, 'I', 30)], { facile: '2 × (6 × 30 s / 30 s).', dure: '2 × (10 × 30 s / 30 s).' })
f('vmaCourte', 2, 'VMA 2 × (10 × 30 s / 30 s)', OBJ_30, [t(10, 30, 'I', 30), pause3(), t(10, 30, 'I', 30)], { facile: '2 × (8 × 30 s / 30 s).', dure: '2 × (12 × 30 s / 30 s).' })
f('vmaCourte', 2, 'VMA 12 × 45 s / 45 s', 'Efforts un peu plus longs, même intensité.', [t(12, 45, 'I', 45)])
f('vmaCourte', 2, 'VMA 10 × 1 min / 1 min', 'Transition vers la VMA longue.', [t(10, 60, 'I', 60)])
f('vmaCourte', 2, 'VMA 3 × (6 × 30 s / 30 s)', 'Trois séries courtes pour garder la qualité.', [t(6, 30, 'I', 30), pause3(), t(6, 30, 'I', 30), pause3(), t(6, 30, 'I', 30)], { facile: '2 séries.', dure: '3 × (8 × 30 s / 30 s).' })
f('vmaCourte', 3, 'VMA 2 × (12 × 30 s / 30 s)', OBJ_30, [t(12, 30, 'I', 30), pause3(), t(12, 30, 'I', 30)], { facile: '2 × (10 × 30 s / 30 s).', dure: '2 × (14 × 30 s / 30 s).' })
f('vmaCourte', 3, 'VMA 3 × (8 × 30 s / 30 s)', OBJ_30, [t(8, 30, 'I', 30), pause3(), t(8, 30, 'I', 30), pause3(), t(8, 30, 'I', 30)], { facile: '2 séries.', dure: '3 × (10 × 30 s / 30 s).' })
f('vmaCourte', 3, 'VMA 15 × 1 min / 1 min', 'Gros volume à VO2max.', [t(15, 60, 'I', 60)], { rpe: 9 })
f('vmaCourte', 3, 'VMA 2 × (10 × 45 s / 30 s)', 'Récupération plus courte que l’effort : la FC reste haute.', [t(10, 45, 'I', 30), pause3(), t(10, 45, 'I', 30)], { rpe: 9, facile: '2 × (8 × 45 s / 30 s).', dure: '2 × (12 × 45 s / 30 s).' })
f('vmaCourte', 3, 'VMA 20 × 30 s / 30 s en continu', 'Une seule série longue, régularité absolue.', [t(20, 30, 'I', 30)])
f('vmaCourte', 3, 'VMA 10 × 300 m', 'Efforts courts sur piste, avec un repère de distance.', [d(10, 300, 'I', 60)], { terrain: 'piste' })

// ── Vitesse ──
const OBJ_R = 'Améliorer la vitesse et l’économie de course : vite, relâché, récupération complète.'
f('vitesse', 1, 'Vitesse 6 × 20 s', 'Découvrir la course rapide et relâchée.', [t(6, 20, 'R', 100)], { rpe: 5 })
f('vitesse', 1, 'Vitesse 6 × 200 m', OBJ_R, [d(6, 200, 'R', 120)], { terrain: 'piste', rpe: 6 })
f('vitesse', 1, 'Vitesse 8 × 30 s', OBJ_R, [t(8, 30, 'R', 90)], { rpe: 6 })
f('vitesse', 1, 'Vitesse 5 × 40 s', 'Tenir la vitesse un peu plus longtemps.', [t(5, 40, 'R', 120)], { rpe: 6 })
f('vitesse', 2, 'Vitesse 8 × 200 m', OBJ_R, [d(8, 200, 'R', 120)], { terrain: 'piste' })
f('vitesse', 2, 'Vitesse 6 × 300 m', OBJ_R, [d(6, 300, 'R', 150)], { terrain: 'piste' })
f('vitesse', 2, 'Vitesse 6 × 400 m', 'La répétition type de Daniels.', [d(6, 400, 'R', 180)], { terrain: 'piste' })
f('vitesse', 2, 'Vitesse 10 × 1 min', 'Version au temps, sans piste.', [t(10, 60, 'R', 120)])
f('vitesse', 3, 'Vitesse 8 × 400 m', OBJ_R, [d(8, 400, 'R', 180)], { terrain: 'piste' })
f('vitesse', 3, 'Vitesse 10 × 200 m, récupération courte', 'Vitesse sous légère fatigue (1500 m, 3000 m).', [d(10, 200, 'R', 90)], { terrain: 'piste', pour: ['demiFond'], rpe: 8 })
f('vitesse', 3, 'Vitesse 2 × (5 × 300 m)', 'Deux séries pour garder la qualité du geste.', [d(5, 300, 'R', 150), t(1, 300, 'E', 0, 'trot', 'Trot entre les séries'), d(5, 300, 'R', 150)], { terrain: 'piste', facile: '2 × (4 × 300 m).', dure: '2 × (6 × 300 m).' })
f('vitesse', 3, 'Vitesse 5 × 600 m', 'Répétitions longues, spécifiques au 1500 m.', [d(5, 600, 'R', 240)], { terrain: 'piste', pour: ['demiFond'], rpe: 8 })
f('vitesse', 3, 'Vitesse 4 × 200 m, 4 × 400 m, 4 × 200 m', 'Varier les distances sans perdre la vitesse.', [d(4, 200, 'R', 120), t(1, 120, 'E'), d(4, 400, 'R', 180), t(1, 180, 'E'), d(4, 200, 'R', 120)], { terrain: 'piste', facile: '3 répétitions par bloc.', dure: '5 répétitions par bloc.' })

// ── Côtes ──
const OBJ_C = 'Force et puissance aérobie avec moins de chocs qu’à plat.'
const cote = (n, s, recup, pente = 'Côte de 5 à 8 %, descente en trottinant') => t(n, s, 'I', recup, 'trot', pente)
f('cotes', 1, 'Côtes 6 × 30 s', 'Découvrir le travail en côte.', [cote(6, 30, 90)], { terrain: 'cote', rpe: 7 })
f('cotes', 1, 'Côtes 8 × 20 s', 'Montées courtes et dynamiques, appuis toniques.', [cote(8, 20, 80, 'Côte de 6 à 10 %, montée dynamique, retour en marchant')], { terrain: 'cote', rpe: 7 })
f('cotes', 1, 'Côtes 5 × 45 s', OBJ_C, [cote(5, 45, 105)], { terrain: 'cote', rpe: 7 })
f('cotes', 1, 'Côtes 4 × 1 min', 'Allonger l’effort en montée.', [cote(4, 60, 120)], { terrain: 'cote', rpe: 7 })
f('cotes', 2, 'Côtes 8 × 45 s', OBJ_C, [cote(8, 45, 90)], { terrain: 'cote' })
f('cotes', 2, 'Côtes 10 × 30 s', OBJ_C, [cote(10, 30, 75)], { terrain: 'cote' })
f('cotes', 2, 'Côtes 6 × 1 min', OBJ_C, [cote(6, 60, 120)], { terrain: 'cote' })
f('cotes', 2, 'Côtes 5 × 1 min 30', 'Côtes longues, effort proche de VO2max.', [cote(5, 90, 150, 'Côte de 4 à 6 %, descente en trottinant')], { terrain: 'cote' })
f('cotes', 3, 'Côtes 10 × 1 min', OBJ_C, [cote(10, 60, 105)], { terrain: 'cote' })
f('cotes', 3, 'Côtes 8 × 1 min 30', 'Côtes longues, spécifiques au cross et au trail.', [cote(8, 90, 150, 'Côte de 4 à 6 %, descente en trottinant')], { terrain: 'cote', rpe: 9 })
f('cotes', 3, 'Côtes 6 × 2 min', 'Tenir la puissance sur une montée longue.', [cote(6, 120, 180, 'Côte de 4 à 6 %, descente en trottinant')], { terrain: 'cote', rpe: 9 })
f('cotes', 3, 'Côtes 12 × 45 s', 'Volume en côte, récupération en descente.', [cote(12, 45, 90)], { terrain: 'cote' })
f('cotes', 3, 'Côtes explosives 2 × (6 × 15 s)', 'Puissance maximale : très court, récupération complète.', [t(6, 15, 'R', 105, 'marche', 'Côte de 8 à 12 %, sprint, retour en marchant'), t(1, 240, 'E', 0, 'trot', 'Trot entre les séries'), t(6, 15, 'R', 105, 'marche', 'Côte de 8 à 12 %, sprint, retour en marchant')], { terrain: 'cote', rpe: 7, facile: '2 × (4 × 15 s).', dure: '2 × (8 × 15 s).' })

// ── Fartlek ──
const OBJ_F = 'Varier les allures au ressenti, sans chrono : jeu de vitesse.'
const lent = (s) => t(1, s, 'E', 0, 'trot', 'Trot lent')
f('fartlek', 1, 'Fartlek 6 × 1 min vite / 2 min lent', 'Première séance à allures variées.', [t(6, 60, 'I', 120)], { rpe: 5 })
f('fartlek', 1, 'Fartlek 5 × 2 min / 2 min', OBJ_F, [t(5, 120, 'T', 120)], { rpe: 5 })
f('fartlek', 1, 'Fartlek 8 × 30 s vite / 1 min 30 lent', 'Accélérations courtes sur un parcours nature.', [t(8, 30, 'I', 90)], { rpe: 5 })
f('fartlek', 1, 'Fartlek pyramide 1-2-1-2-1 min', OBJ_F, [t(1, 60, 'I'), lent(60), t(1, 120, 'T'), lent(120), t(1, 60, 'I'), lent(60), t(1, 120, 'T'), lent(120), t(1, 60, 'I')], { rpe: 5, facile: 'Pyramide 1-2-1 min.', dure: 'Pyramide 1-2-3-2-1 min.' })
f('fartlek', 2, 'Fartlek 8 × 1 min / 1 min', OBJ_F, [t(8, 60, 'I', 60)])
f('fartlek', 2, 'Fartlek 5 × 3 min / 2 min', 'Fractions longues au ressenti, proches du seuil.', [t(5, 180, 'T', 120)])
f('fartlek', 2, 'Fartlek pyramide 1-2-3-2-1 min', OBJ_F, [t(1, 60, 'I'), lent(60), t(1, 120, 'I'), lent(90), t(1, 180, 'T'), lent(120), t(1, 120, 'I'), lent(90), t(1, 60, 'I')], { facile: 'Pyramide 1-2-1 min.', dure: 'Pyramide 1-2-3-3-2-1 min.' })
f('fartlek', 2, 'Fartlek 10 × 1 min soutenu / 1 min', 'Relances répétées à allure seuil.', [t(10, 60, 'T', 60)], { rpe: 5 })
f('fartlek', 2, 'Fartlek libre 30 min', 'Au feeling : 8 à 10 accélérations de 30 s à 2 min selon le terrain.', [t(1, min(30), 'E', 0, 'trot', '8 à 10 accélérations libres de 30 s à 2 min, selon le terrain')], { facile: '6 accélérations.', dure: '12 accélérations.' })
f('fartlek', 3, 'Fartlek pyramide 1-2-3-4-3-2-1 min', OBJ_F, [t(1, 60, 'I'), lent(60), t(1, 120, 'I'), lent(60), t(1, 180, 'I'), lent(90), t(1, 240, 'T'), lent(120), t(1, 180, 'I'), lent(90), t(1, 120, 'I'), lent(60), t(1, 60, 'I')], { rpe: 7, facile: 'Pyramide 1-2-3-2-1 min.', dure: 'Deux fois la pyramide 1-2-3-2-1 min.' })
f('fartlek', 3, 'Fartlek 6 × 3 min / 1 min 30', 'Efforts soutenus, récupération incomplète.', [t(6, 180, 'I', 90)], { rpe: 7 })
f('fartlek', 3, 'Fartlek 4 × 5 min / 2 min', 'Longues fractions au seuil sur terrain varié.', [t(4, 300, 'T', 120)])
f('fartlek', 3, 'Fartlek 12 × 1 min / 1 min', OBJ_F, [t(12, 60, 'I', 60)], { rpe: 7 })
f('fartlek', 3, 'Fartlek 3 × (3-2-1 min)', 'De plus en plus vite dans chaque série.', [t(1, 180, 'T'), lent(60), t(1, 120, 'I'), lent(60), t(1, 60, 'R'), lent(180), t(1, 180, 'T'), lent(60), t(1, 120, 'I'), lent(60), t(1, 60, 'R'), lent(180), t(1, 180, 'T'), lent(60), t(1, 120, 'I'), lent(60), t(1, 60, 'R')], { rpe: 7, facile: '2 séries.', dure: '4 séries.' })

// ── Renforcement ──
const OBJ_RF = 'Renforcer pour mieux encaisser les chocs et courir plus économiquement.'
f('renfo', 1, 'Gainage découverte', 'Stabiliser le tronc.', [x(3, 20, 'Planche sur les avant-bras', 30), x(3, 30, 'Planche latérale, 15 s de chaque côté', 30), x(3, 40, 'Pont fessier, 10 montées lentes', 30)], { rpe: 4, facile: '2 séries par exercice.', dure: '30 s de planche.' })
f('renfo', 1, 'Jambes sans charge', OBJ_RF, [x(2, 40, 'Squats, 10 répétitions', 45), x(2, 50, 'Fentes avant, 8 par jambe', 45), x(2, 40, 'Montées sur pointes, 12 répétitions', 45)], { rpe: 4, facile: '1 série par exercice.', dure: '3 séries par exercice.' })
f('renfo', 1, 'Pieds et chevilles', 'Renforcer le pied et l’équilibre, première protection du coureur.', [x(2, 40, 'Montées sur pointes lentes, 12 répétitions', 30), x(2, 60, 'Équilibre sur un pied, 30 s par côté', 30), x(2, 40, 'Marche sur les talons puis sur les pointes, 20 m', 30)], { rpe: 3, facile: '1 série.', dure: 'Équilibre les yeux fermés.' })
f('renfo', 1, 'Circuit complet 10 min', 'Un tour d’horizon : jambes, tronc, fessiers.', [x(2, 240, 'Circuit : 10 squats, 20 s de planche, 8 fentes par jambe, 10 ponts fessiers', 60)], { rpe: 5, facile: '1 tour.', dure: '3 tours.' })
f('renfo', 2, 'Gainage 3 plans', 'Stabiliser le tronc dans toutes les directions.', [x(3, 40, 'Planche sur les avant-bras', 30), x(3, 60, 'Planche latérale, 30 s de chaque côté', 30), x(3, 40, 'Gainage dorsal (superman), 12 répétitions', 30)], { facile: '2 séries.', dure: 'Planche avec lever de jambe alterné.' })
f('renfo', 2, 'Force des jambes', OBJ_RF, [x(3, 50, 'Squats, 12 répétitions', 60), x(3, 60, 'Fentes marchées, 10 par jambe', 60), x(3, 50, 'Pont fessier sur une jambe, 8 par côté', 45), x(3, 50, 'Mollets sur une jambe, 10 par côté', 45)], { rpe: 6, facile: '2 séries.', dure: 'Ajouter une charge légère (sac à dos).' })
f('renfo', 2, 'Circuit training 15 min', 'Renforcement général en circuit.', [x(3, 270, 'Circuit : 12 squats, 30 s de planche, 10 fentes par jambe, 10 pompes, 12 ponts fessiers', 60)], { rpe: 6, facile: '2 tours.', dure: '4 tours.' })
f('renfo', 2, 'Pliométrie douce', 'Raideur du tendon et rebond : appuis brefs et légers.', [x(3, 30, 'Sauts à la corde ou sautillés sur place', 45), x(3, 20, 'Sauts de cheville, jambes presque tendues, 10 répétitions', 45), x(3, 20, 'Montées de marche dynamiques, 8 par jambe', 45)], { rpe: 5, facile: '2 séries.', dure: '4 séries.' })
f('renfo', 3, 'Force lourde', 'Force maximale : peu de répétitions, charge lourde, technique parfaite.', [x(3, 40, 'Squat chargé, 5 répétitions lourdes', 150), x(3, 40, 'Soulevé de terre, 5 répétitions lourdes', 150), x(3, 40, 'Mollets chargés, 8 répétitions', 90)], { rpe: 7, facile: '2 séries, charge modérée.', dure: '4 séries.' })
f('renfo', 3, 'Pliométrie', 'Puissance et économie de course par les bonds.', [x(3, 20, 'Sauts contre-haut sur une marche ou un banc, 6 répétitions', 90), x(3, 20, 'Foulées bondissantes, 20 m', 90), x(3, 15, 'Sauts en contrebas enchaînés d’un rebond, 5 répétitions', 90)], { rpe: 6, facile: '2 séries.', dure: '4 séries.' })
f('renfo', 3, 'Gainage dynamique', 'Tronc solide en mouvement.', [x(3, 45, 'Planche avec toucher d’épaule alterné', 30), x(3, 60, 'Planche latérale avec abaissement du bassin, 10 par côté', 30), x(3, 45, 'Grimpeur (montagnard) lent et contrôlé', 30), x(3, 45, 'Gainage dorsal bras et jambe opposés', 30)], { facile: '2 séries.', dure: '60 s par exercice.' })
f('renfo', 3, 'Circuit training 20 min', 'Renforcement général soutenu.', [x(4, 270, 'Circuit : 15 squats, 40 s de planche, 12 fentes sautées, 12 pompes, 10 ponts sur une jambe', 45)], { rpe: 7, facile: '3 tours.', dure: '5 tours.' })
f('renfo', 3, 'Excentrique mollets et ischio-jambiers', 'Protéger tendon d’Achille et ischio-jambiers par le travail en freinage.', [x(3, 60, 'Descentes lentes sur une marche, sur une jambe, 10 par côté', 60), x(3, 40, 'Flexions nordiques des ischio-jambiers, 5 répétitions', 90), x(3, 40, 'Pont fessier jambes tendues sur les talons, 10 répétitions', 60)], { rpe: 6, facile: '2 séries.', dure: '4 séries.' })

// ── Éducatifs ──
const OBJ_ED = 'Améliorer la technique de course : placement, fréquence, pied actif.'
const gamme = (n, nom) => x(n, 25, nom, 35)
f('educatifs', 1, 'Gammes de base', 'Découvrir trois éducatifs simples.', [gamme(2, 'Montées de genoux, 20 m'), gamme(2, 'Talons-fesses, 20 m'), gamme(2, 'Pas chassés, 20 m de chaque côté')], { facile: '1 passage.', dure: '3 passages.' })
f('educatifs', 1, 'Coordination', 'Dissocier bras et jambes.', [gamme(2, 'Montées de genoux en marchant, bras coordonnés, 20 m'), gamme(2, 'Course arrière, 20 m'), gamme(2, 'Jambes tendues (soldat), 20 m')], { facile: '1 passage.', dure: '3 passages.' })
f('educatifs', 1, 'Posture et cadence', 'Raccourcir la foulée et augmenter la fréquence des appuis.', [t(3, 60, 'E', 60, 'trot', 'Petits pas rapides : environ 5 % de pas en plus qu’à votre habitude')], { facile: '2 répétitions.', dure: '5 répétitions.' })
f('educatifs', 1, 'Lignes droites techniques', 'Accélérer progressivement en restant grand et relâché.', [t(4, 15, 'R', 75, 'marche', 'Accélération progressive sur 60 m, retour en marchant')], { facile: '3 lignes droites.', dure: '6 lignes droites.' })
f('educatifs', 2, 'Gammes complètes', OBJ_ED, [gamme(2, 'Montées de genoux, 30 m'), gamme(2, 'Talons-fesses, 30 m'), gamme(2, 'Jambes tendues, 30 m'), gamme(2, 'Pas chassés, 30 m de chaque côté'), gamme(2, 'Griffés de pied, 30 m'), gamme(2, 'Course arrière, 30 m')], { facile: '1 passage.', dure: '3 passages.' })
f('educatifs', 2, 'Foulées bondissantes', 'Pousser loin derrière : amplitude et rebond.', [gamme(2, 'Griffés de pied, 30 m'), x(4, 20, 'Foulées bondissantes, 30 m', 60)], { rpe: 4, facile: '2 passages de foulées bondissantes.', dure: '6 passages.' })
f('educatifs', 2, 'Cadence et fréquence', 'Travailler la fréquence d’appuis en courant.', [gamme(2, 'Montées de genoux en fréquence, 20 m'), t(4, 60, 'E', 60, 'trot', 'Fréquence élevée, pas courts')], { facile: '3 répétitions.', dure: '6 répétitions.' })
f('educatifs', 2, 'Gammes et accélérations', 'Enchaîner éducatifs et course rapide.', [gamme(2, 'Montées de genoux, 30 m'), gamme(2, 'Talons-fesses, 30 m'), t(4, 15, 'R', 75, 'marche', 'Accélération progressive sur 80 m')], { rpe: 4, facile: '3 accélérations.', dure: '6 accélérations.' })
f('educatifs', 3, 'Gammes athlétiques', OBJ_ED, [gamme(3, 'Montées de genoux, 40 m'), gamme(3, 'Talons-fesses, 40 m'), gamme(3, 'Jambes tendues, 40 m'), gamme(3, 'Griffés de pied, 40 m'), gamme(3, 'Pas chassés croisés, 40 m')], { facile: '2 passages.', dure: 'Enchaîner chaque passage par 20 m d’accélération.' })
f('educatifs', 3, 'Bonds et multi-bonds', 'Puissance de l’appui.', [x(3, 20, 'Foulées bondissantes, 40 m', 75), x(3, 15, 'Cloche-pied, 20 m par jambe', 75), x(3, 15, 'Bonds pieds joints, 8 répétitions', 75)], { rpe: 5, facile: '2 séries.', dure: '4 séries.' })
f('educatifs', 3, 'Sprints techniques 6 × 60 m', 'Vitesse maximale contrôlée, récupération complète.', [gamme(2, 'Montées de genoux, 30 m'), t(6, 10, 'R', 110, 'marche', 'Sprint de 60 m à 95 %, retour en marchant')], { rpe: 5, facile: '4 sprints.', dure: '8 sprints.' })
f('educatifs', 3, 'Fréquence sur repères', 'Fréquence maximale sur des repères rapprochés (lattes ou plots).', [x(4, 15, 'Appuis rapides entre des repères espacés de 1,50 m, sur 20 m', 60), t(4, 15, 'R', 75, 'marche', 'Accélération libre sur 60 m en gardant la fréquence')], { rpe: 4, facile: '3 passages.', dure: '6 passages.' })

// ── Récupération ──
const OBJ_REC = 'Accélérer la récupération sans ajouter de fatigue.'
f('recuperation', 1, 'Marche active 30 min', 'Bouger sans choc le lendemain d’une séance difficile.', [t(1, min(30), 'marche')], { ech: [], retour: [], rpe: 1 })
f('recuperation', 1, 'Footing très lent 20 min', OBJ_REC, [t(1, min(15), 'aisance')], { ech: [], retour: [t(1, 300, 'marche')] })
f('recuperation', 1, 'Marche-course très facile 25 min', OBJ_REC, [t(8, 120, 'aisance', 60, 'marche')], { ech: [], retour: [t(1, 120, 'marche')] })
f('recuperation', 1, 'Mobilité 15 min', 'Détendre hanches, mollets et dos.', [x(1, 300, 'Hanches : fentes basses, cercles de bassin'), x(1, 300, 'Mollets et chevilles : étirements doux, 30 s par position'), x(1, 300, 'Dos : chat-vache, rotations allongé')], { ech: [], retour: [], rpe: 1, facile: '10 min.', dure: '20 min.' })
f('recuperation', 2, 'Footing de récupération 30 min', OBJ_REC, [t(1, min(30), 'aisance')], { ech: [], retour: [] })
f('recuperation', 2, 'Footing 25 min + mobilité', 'Récupération active puis mobilité.', [t(1, min(25), 'aisance'), x(1, 600, 'Mobilité : hanches, mollets, dos')], { ech: [], retour: [], facile: '20 min de footing.', dure: '30 min de footing.' })
f('recuperation', 2, 'Vélo ou natation 40 min', 'Entretenir le cœur sans choc.', [x(1, min(40), 'Vélo, natation ou elliptique, respiration aisée')], { ech: [], retour: [], facile: '30 min.', dure: '50 min.' })
f('recuperation', 2, 'Footing très lent 35 min', OBJ_REC, [t(1, min(35), 'aisance')], { ech: [], retour: [] })
f('recuperation', 3, 'Footing de récupération 40 min', OBJ_REC, [t(1, min(40), 'aisance')], { ech: [], retour: [] })
f('recuperation', 3, 'Footing 30 min + mobilité', 'Récupération active puis mobilité.', [t(1, min(30), 'aisance'), x(1, 600, 'Mobilité : hanches, mollets, dos')], { ech: [], retour: [], facile: '25 min de footing.', dure: '35 min de footing.' })
f('recuperation', 3, 'Vélo ou natation 60 min', 'Volume aérobie sans choc, utile en cas de jambes lourdes.', [x(1, min(60), 'Vélo, natation ou elliptique, respiration aisée')], { ech: [], retour: [], facile: '45 min.', dure: '75 min.' })
f('recuperation', 3, 'Footing de récupération 45 min', OBJ_REC, [t(1, min(45), 'aisance')], { ech: [], retour: [] })
f('recuperation', 3, 'Décrassage du lendemain de course 25 min', 'Relancer la circulation le lendemain d’une compétition.', [t(1, min(25), 'aisance', 0, 'trot', 'Sur terrain souple si possible')], { ech: [], retour: [], rpe: 1 })

// ── Marche-course (débutant) : 10 étapes vers 30 min de course ──
const mc = (niv, titre, obj, corps) => f('marcheCourse', niv, titre, obj, corps, { facile: 'Refaites l’étape précédente.', dure: 'Passez à l’étape suivante si celle-ci vous paraît facile deux fois de suite.' })
const alt = (n, course, marche) => t(n, course, 'aisance', marche, 'marche')
mc(1, 'Étape 1 : 8 × (1 min de course / 1 min 30 de marche)', 'Premiers pas de course, sans essoufflement.', [alt(8, 60, 90)])
mc(1, 'Étape 2 : 6 × (1 min 30 de course / 2 min de marche)', 'Allonger doucement le temps de course.', [alt(6, 90, 120)])
mc(1, 'Étape 3 : 5 × (2 min de course / 2 min de marche)', 'Autant de course que de marche.', [alt(5, 120, 120)])
mc(1, 'Étape 4 : 4 × (3 min de course / 2 min de marche)', 'Plus de course que de marche.', [alt(4, 180, 120)])
mc(2, 'Étape 5 : 3 × (5 min de course / 2 min 30 de marche)', 'Tenir 5 minutes d’affilée.', [alt(3, 300, 150)])
mc(2, 'Étape 6 : 2 × (8 min de course / 3 min de marche)', 'Deux longues fractions.', [alt(2, 480, 180)])
mc(2, 'Étape 7 : 2 × (10 min de course / 3 min de marche)', '20 minutes de course au total.', [alt(2, 600, 180)])
mc(3, 'Étape 8 : 15 min de course, 2 min de marche, 10 min de course', 'Une seule pause.', [t(1, 900, 'aisance'), t(1, 120, 'marche'), t(1, 600, 'aisance')])
mc(3, 'Étape 9 : 25 min de course continue', 'Courir sans s’arrêter.', [t(1, 1500, 'aisance')])
mc(3, 'Étape 10 : 30 min de course continue', 'L’objectif : 30 minutes, environ 5 km.', [t(1, 1800, 'aisance')])

// ── Affûtage ──
const OBJ_A = 'Garder le rythme en arrivant frais : volume réduit, intensité maintenue.'
const veille = (minutes, n) => [t(1, min(minutes), 'E'), t(n, 20, 'R', 60, 'trot', 'Lignes droites relâchées')]
f('affutage', 1, 'Rappel 3 × 2 min au seuil', OBJ_A, [t(3, 120, 'T', 120)], { rpe: 4 })
f('affutage', 1, 'Rappel 4 × 1 min vite', OBJ_A, [t(4, 60, 'I', 120)], { rpe: 4 })
f('affutage', 1, 'Rappel 2 × 5 min à allure de course', 'Dernier repérage de l’allure visée.', [t(2, 300, 'T', 180)], { rpe: 5 })
f('affutage', 1, 'Veille de course : 15 min + 4 lignes droites', 'Mise en jambes, rien de plus.', veille(15, 4), { ech: [], retour: [], rpe: 2, categorie: 'facile', facile: 'Repos complet si vous êtes fatigué.', dure: 'Aucune : ne faites pas plus la veille.' })
f('affutage', 2, 'Rappel 4 × 2 min', OBJ_A, [t(4, 120, 'I', 120)])
f('affutage', 2, 'Rappel 3 × 1000 m au seuil', 'Dernière séance rythmée, 4 à 5 jours avant la course.', [d(3, 1000, 'T', 120)], { rpe: 5 })
f('affutage', 2, 'Rappel 2 × 8 min allure marathon', 'Dernier repérage de l’allure de course.', [t(2, 480, 'M', 120)], { rpe: 4, pour: ['semi', 'marathon'] })
f('affutage', 2, 'Veille de course : 20 min + 5 lignes droites', 'Mise en jambes, rien de plus.', veille(20, 5), { ech: [], retour: [], rpe: 2, categorie: 'facile', facile: 'Repos complet si vous êtes fatigué.', dure: 'Aucune : ne faites pas plus la veille.' })
f('affutage', 3, 'Rappel 5 × 2 min', OBJ_A, [t(5, 120, 'I', 120)])
f('affutage', 3, 'Rappel 3 × 1000 m au seuil + 2 × 400 m vite', 'Rythme de course puis vitesse.', [d(3, 1000, 'T', 90), t(1, 180, 'E'), d(2, 400, 'R', 180)], { rpe: 6, terrain: 'piste', facile: '2 × 1000 m + 2 × 400 m.', dure: '4 × 1000 m + 2 × 400 m.' })
f('affutage', 3, 'Rappel 2 × 3 km allure marathon', 'Dernier repérage de l’allure de course.', [d(2, 3000, 'M', 180)], { rpe: 5, pour: ['semi', 'marathon'] })
f('affutage', 3, 'Rappel 6 × 200 m vite', 'Réveiller la vitesse sans fatigue (1500 m à 5 km).', [d(6, 200, 'R', 120)], { rpe: 5, terrain: 'piste', pour: ['demiFond', 'cinqDix'] })
f('affutage', 3, 'Veille de course : 25 min + 6 lignes droites', 'Mise en jambes, rien de plus.', veille(25, 6), { ech: [], retour: [], rpe: 2, categorie: 'facile', facile: 'Repos complet si vous êtes fatigué.', dure: 'Aucune : ne faites pas plus la veille.' })

writeFileSync(new URL('../src/donnees/seances.json', import.meta.url), `${JSON.stringify({ version: 1, allures: 'E, M, T, I, R : allures de Daniels (2014), calculées à partir du VDOT du coureur. Zones : échelle à 5 zones (Seiler, 2010).', seances: fiches }, null, 1)}\n`)
const parType = {}
for (const x1 of fiches) parType[x1.type] = (parType[x1.type] ?? 0) + 1
console.log(fiches.length, 'séances', parType)
