// Bilan PDF : ce qu'un entraîneur veut voir d'un coup d'œil. Texte et
// tableaux seulement ; les graphiques restent dans l'appli.

import { type DateIso, formaterDate } from '../domaine/dates'
import { formaterAllure, formaterDuree } from '../domaine/format'
import type { Donnees, Evaluation, Objectif, Plan } from '../domaine/modele'
import { bilansHebdo, calculerAlertes } from '../domaine/suivi'
import { type Comparaison, comparerPrevuRealise, regulariteHebdo, synthetiser } from '../domaine/tableauDeBord'
import { calculerAllures } from '../domaine/vdot'
import { DocumentPdf } from './pdf'

const NOMS_NIVEAUX = { 1: 'débutant', 2: 'intermédiaire', 3: 'confirmé' }
const fr = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))
const jourMois = (d: DateIso) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`
const signe = (n: number | null) => (n === null ? '' : n > 0 ? `+${fr(n)}` : fr(n))

export interface EntreeRapport {
  donnees: Donnees
  plan: Plan | null
  objectif: Objectif | null
  evaluation: Evaluation | null
  jour: DateIso
}

/** Lignes du tableau des séances, de la plus récente à la plus ancienne. */
export function lignesSeances(comparaisons: Comparaison[], max: number): string[][] {
  return [...comparaisons]
    .reverse()
    .slice(0, max)
    .map(({ date, statut, prevue, activite: a, ecartRpe }) => [
      jourMois(date),
      prevue?.titre ?? 'Hors plan',
      prevue ? `${fr(prevue.distanceKm)} km` : '',
      statut === 'manquee' ? 'manquée' : a ? `${fr(Math.round(a.distanceM / 100) / 10)} km` : '',
      a ? formaterDuree(a.dureeS) : '',
      a && a.distanceM > 0 ? formaterAllure(a.dureeS / (a.distanceM / 1000)).replace('/km', '') : '',
      fr(a?.fcMoy),
      prevue ? String(prevue.rpeVise) : '',
      fr(a?.rpe),
      signe(ecartRpe),
    ])
}

export function construireRapport({ donnees, plan, objectif, evaluation, jour }: EntreeRapport): Uint8Array<ArrayBuffer> {
  const { profil, activites } = donnees
  const pdf = new DocumentPdf(`Coach Course · bilan du ${formaterDate(jour, false)} ${jour.slice(0, 4)}`)
  pdf.titre(`Bilan d’entraînement${profil?.prenom ? ` de ${profil.prenom}` : ''}`)

  // ── Le coureur ──
  if (profil) {
    const age = Number(jour.slice(0, 4)) - profil.anneeNaissance
    pdf.paragraphe(`${age} ans, niveau ${NOMS_NIVEAUX[profil.niveau]}, ${profil.joursDisponibles.length} séances par semaine, volume de départ ${profil.volumeHebdoKm} km par semaine.`)
    if (profil.blessureRecente || profil.blessures) pdf.paragraphe(`Blessure signalée : ${profil.blessures || 'oui'}.`)
    if (profil.alerteSante) pdf.paragraphe('Signal de santé déclaré au questionnaire : avis médical recommandé.')
  }
  if (objectif) {
    pdf.paragraphe(`Objectif : ${objectif.nom}, le ${formaterDate(objectif.date)} ${objectif.date.slice(0, 4)}${objectif.tempsViseS ? `, temps visé ${formaterDuree(objectif.tempsViseS)}` : ''}${objectif.deniveleM ? `, ${objectif.deniveleM} m de dénivelé positif` : ''}.`)
  }
  if (evaluation) {
    const a = calculerAllures(evaluation.vdot)
    pdf.paragraphe(
      `Niveau (évaluation du ${formaterDate(evaluation.date, false)} ${evaluation.date.slice(0, 4)}, fiabilité ${evaluation.fiabilite}) : VMA ${fr(evaluation.vmaKmh)} km/h, VDOT ${fr(evaluation.vdot)}. ` +
        `Allures : endurance ${formaterDuree(a.E.rapide)} à ${formaterAllure(a.E.lente)}, marathon ${formaterAllure(a.M)}, seuil ${formaterAllure(a.T)}, intervalles ${formaterAllure(a.I)}, répétitions ${formaterAllure(a.R)}.`,
    )
  }

  // ── Prévu / réalisé ──
  const comparaisons = comparerPrevuRealise(plan, activites, jour)
  const s = synthetiser(comparaisons)
  pdf.sousTitre('Prévu et réalisé')
  if (comparaisons.length === 0) pdf.paragraphe('Aucune séance enregistrée pour l’instant.')
  else {
    pdf.paragraphe(
      `${s.seancesFaites} séances faites sur ${s.seancesPrevues} prévues (${s.seancesManquees} manquées), ${s.seancesHorsPlan} hors plan. ` +
        `${fr(s.kmRealises)} km courus pour ${fr(s.kmPrevus)} km prévus.` +
        (s.ecartRpeMoyen !== null ? ` Écart moyen de ressenti : ${signe(s.ecartRpeMoyen)} point (positif = plus dur que prévu).` : ''),
    )
  }

  // ── Semaines ──
  const bilans = bilansHebdo(activites, plan, jour, 8)
  const regularite = regulariteHebdo(plan, activites, jour, 8)
  pdf.sousTitre('Les 8 dernières semaines')
  pdf.tableau(
    [
      { titre: 'Semaine du', largeur: 70 },
      { titre: 'Km prévus', largeur: 70 },
      { titre: 'Km réalisés', largeur: 75 },
      { titre: 'Séances', largeur: 70 },
      { titre: 'Durée', largeur: 60 },
      { titre: 'Charge', largeur: 60 },
      { titre: 'Monotonie', largeur: 60 },
    ],
    bilans.map((b, i) => [
      jourMois(b.debut),
      b.kmPrevus === null ? '' : fr(Math.round(b.kmPrevus)),
      fr(b.km),
      regularite[i].prevues > 0 ? `${regularite[i].faites} sur ${regularite[i].prevues}` : String(b.nbSeances),
      b.dureeMin > 0 ? formaterDuree(b.dureeMin * 60) : '',
      fr(b.charge),
      b.monotonie === null ? '' : fr(Math.round(b.monotonie * 10) / 10),
    ]),
  )
  pdf.paragraphe('Charge = ressenti (RPE, 1 à 10) × minutes, additionnée sur la semaine (Foster et al., 2001). Monotonie = charge moyenne par jour / écart-type (Foster, 1998) ; à garder sous 2.', 8)

  // ── Alertes ──
  const alertes = calculerAlertes(activites, plan, jour)
  if (alertes.length > 0) {
    pdf.sousTitre('Signaux à surveiller')
    for (const a of alertes) pdf.paragraphe(`${a.titre}. ${a.detail} (${a.source})`)
  }

  // ── Séances ──
  if (comparaisons.length > 0) {
    pdf.sousTitre('Séances, de la plus récente à la plus ancienne')
    pdf.tableau(
      [
        { titre: 'Date', largeur: 34 },
        { titre: 'Séance prévue', largeur: 158 },
        { titre: 'Prévu', largeur: 46 },
        { titre: 'Réalisé', largeur: 48 },
        { titre: 'Durée', largeur: 46 },
        { titre: 'Allure', largeur: 36 },
        { titre: 'FC', largeur: 26 },
        { titre: 'RPE prévu', largeur: 48 },
        { titre: 'réel', largeur: 26 },
        { titre: 'écart', largeur: 30 },
      ],
      lignesSeances(comparaisons, 60),
    )
  }

  // ── Évaluations ──
  if (donnees.evaluations.length > 1) {
    pdf.sousTitre('Évolution du niveau')
    pdf.tableau(
      [
        { titre: 'Date', largeur: 90 },
        { titre: 'VDOT', largeur: 60 },
        { titre: 'VMA (km/h)', largeur: 80 },
        { titre: 'Fiabilité', largeur: 80 },
      ],
      [...donnees.evaluations].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [`${formaterDate(e.date, false)} ${e.date.slice(0, 4)}`, fr(e.vdot), fr(e.vmaKmh), e.fiabilite]),
    )
  }
  return pdf.terminer()
}
