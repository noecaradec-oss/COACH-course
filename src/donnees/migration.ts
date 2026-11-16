// Mise à niveau des données enregistrées par une version précédente de
// l'appli. Appliquée à l'ouverture et à la restauration d'une sauvegarde.
// Rien n'est supprimé : les champs nouveaux reçoivent une valeur neutre.

import type { CategorieIntensite } from '../domaine/charge'
import { type Donnees, type Plan, type Profil, type SeancePrevue, VERSION_DONNEES } from '../domaine/modele'
import { determinerNiveau } from '../domaine/niveau'

type Ancien = Record<string, unknown> & { version?: number }

function migrerProfil(p: Ancien): Profil {
  const profil = p as unknown as Profil
  if ((p.version ?? 1) >= 2) return profil
  // Version 1 → 2 : champs issus du questionnaire.
  return {
    ...profil,
    version: VERSION_DONNEES,
    niveau: determinerNiveau(profil.anneesPratique, profil.volumeHebdoKm, false),
    blessureRecente: false,
    alerteSante: false,
    materiel: { gps: false, cardio: false },
    terrains: { piste: true, cotes: true, chemins: true },
  }
}

// Version 1 → 2 : les types de séance s'alignent sur ceux de la base de séances.
const TYPES_V1: Record<string, SeancePrevue['type']> = {
  footing: 'endurance',
  intervalles: 'vmaLongue',
  repetitions: 'vitesse',
  allureMarathon: 'allureSpecifique',
  rappel: 'affutage',
}

// Ressenti visé par défaut pour les séances créées avant que le plan ne le précise.
const RPE_PAR_CATEGORIE: Record<CategorieIntensite, number> = { facile: 3, seuil: 6, intense: 8 }

function migrerPlan(plan: Plan): Plan {
  if (plan.version >= 2) return plan
  return {
    ...plan,
    version: VERSION_DONNEES,
    ajustements: [],
    semaines: plan.semaines.map((semaine) => ({
      ...semaine,
      seances: semaine.seances.map((s) => ({
        ...s,
        type: TYPES_V1[s.type as string] ?? s.type,
        rpeVise: s.rpeVise ?? RPE_PAR_CATEGORIE[s.categorie],
      })),
    })),
  }
}

export function migrer(donnees: Donnees): Donnees {
  return {
    ...donnees,
    profil: donnees.profil ? migrerProfil(donnees.profil as unknown as Ancien) : null,
    evaluations: donnees.evaluations.map((e) => (e.fiabilite ? e : { ...e, version: VERSION_DONNEES, fiabilite: 'bonne' as const })),
    plans: donnees.plans.map(migrerPlan),
  }
}
