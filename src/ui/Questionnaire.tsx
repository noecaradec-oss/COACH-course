// Premier entretien : une question par écran, barre de progression, puis le
// bilan (niveau, VMA, volume de départ, jours) et les conseils de prudence.

import { type FormEvent, useMemo, useState } from 'react'
import { NOMS_JOURS, ajouterJours, formaterDate } from '../domaine/dates'
import { formaterDuree, lireDuree } from '../domaine/format'
import type { JourSemaine } from '../domaine/modele'
import { SEMAINES_MAX } from '../domaine/plan'
import { type Option, type Question, type Reponses, type ResultatQuestionnaire, calculerProfil, estRepondue, questionsVisibles } from '../domaine/questionnaire'
import { Message } from './composants'
import { nouvelId, useCoach } from './Etat'

const NOMS_NIVEAUX = { 1: 'Débutant', 2: 'Intermédiaire', 3: 'Confirmé' }
const NOMS_FIABILITE = { bonne: 'chrono récent', moyenne: 'chrono de 3 à 6 mois', faible: 'estimation peu précise' }

/** Texte affiché dans le champ pour une réponse déjà donnée. */
function texteInitial(q: Question, r: Reponses): string {
  const v = r[q.champ]
  if (v === null || v === '' || Array.isArray(v) || typeof v === 'boolean') return ''
  if (q.saisie.genre === 'duree') return formaterDuree(v as number)
  if (q.saisie.genre === 'nombre') return String((v as number) / (q.saisie.facteur ?? 1)).replace('.', ',')
  return String(v)
}

/** Convertit le texte saisi ; renvoie un message d'erreur si la saisie ne convient pas. */
function lire(q: Question, texte: string, jour: string): { valeur: unknown } | { erreur: string } {
  const propre = texte.trim()
  const s = q.saisie
  if (propre === '') return q.facultative ? { valeur: s.genre === 'texte' ? '' : null } : { erreur: 'Une réponse est nécessaire pour continuer.' }
  if (s.genre === 'texte') return { valeur: propre }
  if (s.genre === 'nombre') {
    const n = Number(propre.replace(',', '.'))
    if (!Number.isFinite(n) || n < s.min || n > s.max) return { erreur: `Indiquez un nombre entre ${String(s.min).replace('.', ',')} et ${s.max}${s.unite ? ` ${s.unite}` : ''}.` }
    return { valeur: Math.round(n * (s.facteur ?? 1) * 10) / 10 }
  }
  if (s.genre === 'duree') {
    const secondes = lireDuree(propre)
    if (!secondes) return { erreur: `Écrivez un temps comme ${s.exemple}.` }
    return { valeur: secondes }
  }
  if (s.genre === 'date') {
    if (propre < jour) return { erreur: 'Cette date est déjà passée.' }
    const limite = ajouterJours(jour, SEMAINES_MAX * 7 - 7)
    if (propre > limite) return { erreur: `Le plan couvre ${SEMAINES_MAX} semaines au plus : choisissez une date avant le ${formaterDate(limite, false)}, ou un objectif intermédiaire.` }
    return { valeur: propre }
  }
  return { valeur: propre }
}

function Choix({ options, valeur, choisir }: { options: Option[]; valeur: unknown; choisir: (v: Option['valeur']) => void }) {
  return (
    <div className="q-options">
      {options.map((o) => (
        <button key={String(o.valeur)} type="button" className={valeur === o.valeur ? 'q-option q-option-active' : 'q-option'} aria-pressed={valeur === o.valeur} onClick={() => choisir(o.valeur)}>
          <span>{o.nom}</span>
          {o.detail && <small>{o.detail}</small>}
        </button>
      ))}
    </div>
  )
}

function Bilan({ resultat, retour, terminer }: { resultat: ResultatQuestionnaire; retour: () => void; terminer?: () => void }) {
  const { appliquerQuestionnaire } = useCoach()
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const { profil, evaluation, objectif, conseils, remarques } = resultat

  async function creer() {
    setEnCours(true)
    try {
      await appliquerQuestionnaire(resultat)
      terminer?.()
    } catch (e) {
      // Le profil est enregistré ; seul le plan a échoué.
      setErreur(`${e instanceof Error ? e.message : 'Le plan n’a pas pu être créé.'} Votre profil est enregistré : vous pourrez créer le plan depuis l’onglet Plan.`)
      setEnCours(false)
    }
  }

  return (
    <div>
      <p className="surtitre">Votre profil</p>
      <h1>{profil.prenom ? `Voilà, ${profil.prenom}` : 'Voilà votre profil'}</h1>
      {conseils.map((c) => (
        <Message key={c} type="erreur">
          <strong>À lire avant de commencer.</strong> {c}
        </Message>
      ))}
      <section className="carte">
        <dl className="bilan">
          <div>
            <dt>Niveau</dt>
            <dd>{NOMS_NIVEAUX[profil.niveau]}</dd>
          </div>
          <div>
            <dt>VMA estimée</dt>
            <dd>
              {evaluation ? `${String(evaluation.vmaKmh).replace('.', ',')} km/h` : 'À mesurer'}
              {evaluation && <small> · VDOT {String(evaluation.vdot).replace('.', ',')} · {NOMS_FIABILITE[evaluation.fiabilite]}</small>}
            </dd>
          </div>
          <div>
            <dt>Volume de départ</dt>
            <dd>{profil.volumeHebdoKm > 0 ? `${profil.volumeHebdoKm} km par semaine` : 'On part de zéro'}</dd>
          </div>
          <div>
            <dt>Jours d’entraînement</dt>
            <dd>{profil.joursDisponibles.map((j) => NOMS_JOURS[j]).join(', ')}</dd>
          </div>
          <div>
            <dt>Objectif</dt>
            <dd>
              {objectif.nom} <small>· {formaterDate(objectif.date)} {objectif.date.slice(0, 4)}</small>
            </dd>
          </div>
        </dl>
      </section>
      {remarques.map((r) => (
        <Message key={r} type="info">
          {r}
        </Message>
      ))}
      {erreur && <Message type="erreur">{erreur}</Message>}
      <div className="boutons">
        {erreur ? (
          <button type="button" className="bouton bouton-principal" onClick={terminer ?? (() => window.location.reload())}>
            Continuer
          </button>
        ) : (
          <button type="button" className="bouton bouton-principal" onClick={creer} disabled={enCours}>
            Créer mon plan
          </button>
        )}
        <button type="button" className="bouton" onClick={retour}>
          Modifier mes réponses
        </button>
      </div>
      <p className="aide">Cette appli ne remplace pas un avis médical.</p>
    </div>
  )
}

export function Questionnaire({ depart, terminer }: { depart: Reponses; terminer?: () => void }) {
  const { jour } = useCoach()
  const [reponses, setReponses] = useState<Reponses>(depart)
  const [rang, setRang] = useState(0)
  const [brouillon, setBrouillon] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [resultat, setResultat] = useState<ResultatQuestionnaire | null>(null)

  const questions = useMemo(() => questionsVisibles(reponses), [reponses])
  const question = questions[Math.min(rang, questions.length - 1)]
  const saisie = question.saisie
  const texte = brouillon ?? texteInitial(question, reponses)

  function aller(nouveauRang: number, r: Reponses) {
    setBrouillon(null)
    setErreur(null)
    const visibles = questionsVisibles(r)
    if (nouveauRang >= visibles.length) {
      try {
        setResultat(calculerProfil(r, jour, nouvelId(), nouvelId()))
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Le questionnaire est incomplet.')
      }
      return
    }
    setRang(Math.max(0, nouveauRang))
  }

  /** Enregistre une réponse et passe à la suite. */
  function repondre(valeur: unknown) {
    const r = { ...reponses, [question.champ]: valeur } as Reponses
    // La sortie longue ne peut tomber que sur un jour coché.
    if (question.champ === 'jours' && r.sortieLongueJour !== null && !r.jours.includes(r.sortieLongueJour)) r.sortieLongueJour = null
    setReponses(r)
    aller(rang + 1, r)
  }

  function basculer(valeur: unknown) {
    const actuel = reponses[question.champ] as unknown[]
    const suivant = actuel.includes(valeur) ? actuel.filter((x) => x !== valeur) : [...actuel, valeur]
    setReponses({ ...reponses, [question.champ]: question.champ === 'jours' ? [...suivant].sort() : suivant } as Reponses)
    setErreur(null)
  }

  function continuer(e: FormEvent) {
    e.preventDefault()
    if (saisie.genre === 'texte' || saisie.genre === 'nombre' || saisie.genre === 'duree' || saisie.genre === 'date') {
      const lu = lire(question, texte, jour)
      if ('erreur' in lu) return setErreur(lu.erreur)
      return repondre(lu.valeur)
    }
    if (!estRepondue(question, reponses)) return setErreur(saisie.genre === 'jours' ? 'Cochez au moins un jour.' : 'Choisissez une réponse pour continuer.')
    aller(rang + 1, reponses)
  }

  if (resultat) return <Bilan resultat={resultat} retour={() => setResultat(null)} {...(terminer ? { terminer } : {})} />

  const numero = Math.min(rang, questions.length - 1) + 1
  const valeur = reponses[question.champ]
  const joursCoches = reponses.jours

  return (
    <div className="questionnaire">
      <div className="q-progression" role="progressbar" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={numero} aria-label={`Question ${numero} sur ${questions.length}`}>
        <span style={{ width: `${(numero / questions.length) * 100}%` }} />
      </div>
      <p className="surtitre">
        {question.theme} · question {numero} sur {questions.length}
      </p>
      <form onSubmit={continuer} className="formulaire">
        <h1 id="q-titre">{question.titre}</h1>
        {question.aide && <p className="aide">{question.aide}</p>}

        {(saisie.genre === 'texte' || saisie.genre === 'duree') && (
          <input key={question.champ} aria-labelledby="q-titre" className="q-champ" value={texte} onChange={(e) => setBrouillon(e.target.value)} placeholder={saisie.genre === 'duree' ? saisie.exemple : ''} autoFocus />
        )}
        {saisie.genre === 'nombre' && (
          <div className="q-nombre">
            <input key={question.champ} aria-labelledby="q-titre" className="q-champ" inputMode="decimal" value={texte} onChange={(e) => setBrouillon(e.target.value)} placeholder={saisie.exemple} autoFocus />
            {saisie.unite && <span>{saisie.unite}</span>}
          </div>
        )}
        {saisie.genre === 'date' && <input key={question.champ} aria-labelledby="q-titre" className="q-champ" type="date" min={jour} value={texte} onChange={(e) => setBrouillon(e.target.value)} />}
        {saisie.genre === 'choix' && <Choix options={saisie.options} valeur={valeur} choisir={repondre} />}
        {saisie.genre === 'multi' && (
          <div className="q-options">
            {saisie.options.map((o) => {
              const coche = (valeur as unknown[]).includes(o.valeur)
              return (
                <button key={String(o.valeur)} type="button" className={coche ? 'q-option q-option-active' : 'q-option'} aria-pressed={coche} onClick={() => basculer(o.valeur)}>
                  <span>{o.nom}</span>
                </button>
              )
            })}
          </div>
        )}
        {saisie.genre === 'jours' && (
          <div className="jours">
            {NOMS_JOURS.map((nom, i) => (
              <button key={nom} type="button" className={joursCoches.includes(i as JourSemaine) ? 'jour jour-actif' : 'jour'} aria-pressed={joursCoches.includes(i as JourSemaine)} onClick={() => basculer(i)}>
                {nom.slice(0, 3)}
              </button>
            ))}
          </div>
        )}
        {saisie.genre === 'jour' && <Choix options={joursCoches.map((j) => ({ valeur: j, nom: NOMS_JOURS[j][0].toUpperCase() + NOMS_JOURS[j].slice(1) }))} valeur={valeur} choisir={repondre} />}

        {erreur && <Message type="erreur">{erreur}</Message>}

        <div className="q-navigation">
          {numero > 1 ? (
            <button type="button" className="bouton" onClick={() => aller(rang - 1, reponses)}>
              Retour
            </button>
          ) : (
            terminer && (
              <button type="button" className="bouton" onClick={terminer}>
                Annuler
              </button>
            )
          )}
          {/* Les questions à choix unique avancent toutes seules ; le bouton sert quand une réponse existe déjà. */}
          {(saisie.genre !== 'choix' && saisie.genre !== 'jour') || estRepondue(question, reponses) ? (
            <button type="submit" className="bouton bouton-principal">
              {numero === questions.length ? 'Voir mon profil' : question.facultative && texte === '' && (saisie.genre === 'texte' || saisie.genre === 'nombre' || saisie.genre === 'duree') ? 'Passer' : 'Continuer'}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
