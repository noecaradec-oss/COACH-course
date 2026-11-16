// État de l'appli : les données chargées depuis l'appareil et les actions
// qui les modifient. Chaque action écrit d'abord dans la base, puis met à
// jour l'affichage.

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { type DateIso, aujourdHui } from '../domaine/dates'
import { evaluationCourante } from '../domaine/evaluation'
import { fcMaxEstimee } from '../domaine/fc'
import type { Activite, Donnees, Evaluation, Objectif, Plan, Profil } from '../domaine/modele'
import { genererPlan } from '../domaine/plan'
import type { ResultatQuestionnaire } from '../domaine/questionnaire'
import { reajuster } from '../domaine/reajustement'
import { type Allures, calculerAllures } from '../domaine/vdot'
import * as base from '../donnees/base'
import { donneesVides } from '../donnees/sauvegarde'

/** Identifiant unique, triable par date de création. */
export function nouvelId(): string {
  return `${Date.now().toString(36).padStart(9, '0')}-${Math.random().toString(36).slice(2, 8)}`
}

interface Coach {
  pret: boolean
  erreur: string | null
  donnees: Donnees
  jour: DateIso
  profil: Profil | null
  evaluation: Evaluation | null
  allures: Allures | null
  /** FC max mesurée, sinon estimée par l'âge. */
  fcMax: number | null
  fcMaxEstimee: boolean
  objectif: Objectif | null
  plan: Plan | null
  majProfil(profil: Profil): Promise<void>
  /**
   * Enregistre le profil, l'évaluation et l'objectif issus du questionnaire, puis génère le plan.
   * Le profil est enregistré même si le plan ne peut pas être créé : l'erreur est alors relancée.
   */
  appliquerQuestionnaire(r: ResultatQuestionnaire): Promise<void>
  ajouterEvaluation(e: Evaluation): Promise<void>
  supprimerEvaluation(id: string): Promise<void>
  /** Enregistre l'objectif et génère son plan. Lève une erreur lisible si impossible. */
  definirObjectif(o: Objectif): Promise<void>
  /** Refait le plan à partir d'aujourd'hui, du niveau et du volume réels. */
  reajusterPlan(): Promise<void>
  enregistrerActivite(a: Activite): Promise<void>
  supprimerActivite(id: string): Promise<void>
  restaurer(donnees: Donnees): Promise<void>
}

const Contexte = createContext<Coach | null>(null)

export function useCoach(): Coach {
  const coach = useContext(Contexte)
  if (!coach) throw new Error('useCoach doit être utilisé dans <FournisseurCoach>.')
  return coach
}

function remplacer<T extends { id: string }>(liste: T[], valeur: T): T[] {
  return liste.some((x) => x.id === valeur.id) ? liste.map((x) => (x.id === valeur.id ? valeur : x)) : [...liste, valeur]
}

export function FournisseurCoach({ children }: { children: ReactNode }) {
  const [donnees, setDonnees] = useState<Donnees>(donneesVides)
  const [pret, setPret] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const jour = aujourdHui()

  useEffect(() => {
    base
      .chargerTout()
      .then((d) => {
        setDonnees(d)
        setPret(true)
        void base.demanderPersistance()
      })
      .catch(() => setErreur('Impossible d’ouvrir le stockage de cet appareil. La navigation privée peut le bloquer.'))
  }, [])

  const majProfil = useCallback(async (profil: Profil) => {
    await base.enregistrerProfil(profil)
    setDonnees((d) => ({ ...d, profil }))
  }, [])

  const appliquerQuestionnaire = useCallback(
    async (r: ResultatQuestionnaire) => {
      await base.enregistrerProfil(r.profil)
      // Refaire le questionnaire avec le même chrono ne doit pas créer un doublon.
      const existante = donnees.evaluations.find((e) => r.evaluation && e.type === r.evaluation.type && e.distanceM === r.evaluation.distanceM && e.dureeS === r.evaluation.dureeS)
      const nouvelle = r.evaluation && !existante ? r.evaluation : null
      if (nouvelle) await base.enregistrer('evaluations', nouvelle)
      const evaluations = nouvelle ? [...donnees.evaluations, nouvelle] : donnees.evaluations
      setDonnees((d) => ({ ...d, profil: r.profil, evaluations }))
      const plan = genererPlan({ id: nouvelId(), profil: r.profil, objectif: r.objectif, vdot: evaluationCourante(evaluations)?.vdot ?? null, dateDepart: jour })
      await base.enregistrer('objectifs', r.objectif)
      await base.enregistrer('plans', plan)
      setDonnees((d) => ({ ...d, objectifs: remplacer(d.objectifs, r.objectif), plans: [...d.plans, plan] }))
    },
    [donnees.evaluations, jour],
  )

  const ajouterEvaluation = useCallback(async (e: Evaluation) => {
    await base.enregistrer('evaluations', e)
    setDonnees((d) => ({ ...d, evaluations: remplacer(d.evaluations, e) }))
  }, [])

  const supprimerEvaluation = useCallback(async (id: string) => {
    await base.supprimer('evaluations', id)
    setDonnees((d) => ({ ...d, evaluations: d.evaluations.filter((x) => x.id !== id) }))
  }, [])

  const creerPlan = useCallback(
    async (d: Donnees, objectif: Objectif) => {
      if (!d.profil) throw new Error('Remplissez d’abord votre profil.')
      const plan = genererPlan({
        id: nouvelId(),
        profil: d.profil,
        objectif,
        vdot: evaluationCourante(d.evaluations)?.vdot ?? null,
        dateDepart: jour,
      })
      await base.enregistrer('objectifs', objectif)
      await base.enregistrer('plans', plan)
      setDonnees((x) => ({ ...x, objectifs: remplacer(x.objectifs, objectif), plans: [...x.plans, plan] }))
    },
    [jour],
  )

  const definirObjectif = useCallback((o: Objectif) => creerPlan(donnees, o), [creerPlan, donnees])

  const plan = useMemo(() => [...donnees.plans].sort((a, b) => a.id.localeCompare(b.id)).at(-1) ?? null, [donnees.plans])
  const objectif = useMemo(() => donnees.objectifs.find((o) => o.id === plan?.objectifId) ?? null, [donnees.objectifs, plan])

  const reajusterPlan = useCallback(async () => {
    if (!objectif || !plan || !donnees.profil) return
    const nouveau = reajuster({
      id: nouvelId(),
      plan,
      profil: donnees.profil,
      objectif,
      vdot: evaluationCourante(donnees.evaluations)?.vdot ?? null,
      activites: donnees.activites,
      jour,
    })
    await base.enregistrer('plans', nouveau)
    setDonnees((x) => ({ ...x, plans: [...x.plans, nouveau] }))
  }, [donnees, objectif, plan, jour])

  const enregistrerActivite = useCallback(async (a: Activite) => {
    await base.enregistrer('activites', a)
    setDonnees((d) => ({ ...d, activites: remplacer(d.activites, a) }))
  }, [])

  const supprimerActivite = useCallback(async (id: string) => {
    await base.supprimer('activites', id)
    setDonnees((d) => ({ ...d, activites: d.activites.filter((x) => x.id !== id) }))
  }, [])

  const restaurer = useCallback(async (d: Donnees) => {
    await base.remplacerTout(d)
    setDonnees(d)
  }, [])

  const coach = useMemo<Coach>(() => {
    const profil = donnees.profil
    const evaluation = evaluationCourante(donnees.evaluations)
    const age = profil ? Number(jour.slice(0, 4)) - profil.anneeNaissance : null
    return {
      pret,
      erreur,
      donnees,
      jour,
      profil,
      evaluation,
      allures: evaluation ? calculerAllures(evaluation.vdot) : null,
      fcMax: profil?.fcMax ?? (age !== null ? fcMaxEstimee(age) : null),
      fcMaxEstimee: !profil?.fcMax,
      objectif,
      plan,
      majProfil,
      appliquerQuestionnaire,
      ajouterEvaluation,
      supprimerEvaluation,
      definirObjectif,
      reajusterPlan,
      enregistrerActivite,
      supprimerActivite,
      restaurer,
    }
  }, [pret, erreur, donnees, jour, objectif, plan, majProfil, appliquerQuestionnaire, ajouterEvaluation, supprimerEvaluation, definirObjectif, reajusterPlan, enregistrerActivite, supprimerActivite, restaurer])

  return <Contexte.Provider value={coach}>{children}</Contexte.Provider>
}
