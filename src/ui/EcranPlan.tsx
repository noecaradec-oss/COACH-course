import { type FormEvent, useMemo, useState } from 'react'
import { ajouterJours, formaterDate, joursEntre } from '../domaine/dates'
import { formaterDuree, lireDuree } from '../domaine/format'
import { type Objectif, type TypeObjectif, VERSION_DONNEES } from '../domaine/modele'
import { distanceEffort } from '../domaine/plan'
import { predireRiegel } from '../domaine/prediction'
import { calculerVdot, evaluerRealisme, predireTemps } from '../domaine/vdot'
import { Carte, Champ, LigneSeance, Message } from './composants'
import { nouvelId, useCoach } from './Etat'
import { NOMS_OBJECTIFS, NOMS_PHASES, TEXTES_REALISME } from './texte'

const DISTANCES: Record<Exclude<TypeObjectif, 'premier5k'>, { nom: string; m: number }[]> = {
  piste: [
    { nom: '1500 m', m: 1500 },
    { nom: '3000 m', m: 3000 },
    { nom: '5000 m', m: 5000 },
    { nom: '10 000 m', m: 10000 },
  ],
  route: [
    { nom: '5 km', m: 5000 },
    { nom: '10 km', m: 10000 },
    { nom: 'Semi-marathon', m: 21097.5 },
    { nom: 'Marathon', m: 42195 },
  ],
  cross: [],
  trail: [],
}

function FormulaireObjectif({ fermer }: { fermer?: () => void }) {
  const { objectif, evaluation, definirObjectif, jour } = useCoach()
  const [type, setType] = useState<TypeObjectif>(objectif?.type ?? (evaluation ? 'route' : 'premier5k'))
  const [distance, setDistance] = useState(String(objectif?.distanceM ?? 10000))
  const [km, setKm] = useState(objectif ? String(objectif.distanceM / 1000).replace('.', ',') : '')
  const [denivele, setDenivele] = useState(objectif?.deniveleM ? String(objectif.deniveleM) : '')
  const [date, setDate] = useState(objectif?.date ?? ajouterJours(jour, 84))
  const [temps, setTemps] = useState(objectif?.tempsViseS ? formaterDuree(objectif.tempsViseS) : '')
  const [nom, setNom] = useState(objectif?.nom ?? '')
  const [erreur, setErreur] = useState<string | null>(null)

  const choix = type === 'premier5k' ? [] : DISTANCES[type]
  const libre = type === 'cross' || type === 'trail'

  async function valider(e: FormEvent) {
    e.preventDefault()
    let distanceM = 5000
    if (type !== 'premier5k') {
      distanceM = libre ? Number(km.replace(',', '.')) * 1000 : Number(choix.some((c) => String(c.m) === distance) ? distance : choix[0].m)
      if (!(distanceM >= 800 && distanceM <= 180000)) return setErreur('Indiquez la distance de la course, en km.')
    }
    const tempsViseS = temps.trim() === '' ? null : lireDuree(temps)
    if (temps.trim() !== '' && !tempsViseS) return setErreur('Écrivez le temps visé sous la forme 45:00 ou 1:45:00.')
    const dPlus = Number(denivele)
    const nouvel: Objectif = {
      id: nouvelId(),
      version: VERSION_DONNEES,
      type,
      nom: nom.trim() || (type === 'premier5k' ? NOMS_OBJECTIFS.premier5k : `${NOMS_OBJECTIFS[type]} ${String(Math.round(distanceM / 100) / 10).replace('.', ',')} km`),
      distanceM,
      date,
      ...(tempsViseS && type !== 'premier5k' ? { tempsViseS } : {}),
      ...(type === 'trail' && dPlus > 0 ? { deniveleM: dPlus } : {}),
    }
    try {
      await definirObjectif(nouvel)
      setErreur(null)
      fermer?.()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Le plan n’a pas pu être créé.')
    }
  }

  return (
    <form onSubmit={valider} className="formulaire">
      <Champ libelle="Type d’objectif">
        <select value={type} onChange={(e) => setType(e.target.value as TypeObjectif)}>
          {(Object.keys(NOMS_OBJECTIFS) as TypeObjectif[]).map((t) => (
            <option key={t} value={t}>
              {NOMS_OBJECTIFS[t]}
            </option>
          ))}
        </select>
      </Champ>
      {type === 'premier5k' && <p className="aide">Programme marche-course, 3 séances par semaine, pour courir 5 km sans s’arrêter. Comptez 8 à 10 semaines. Aucune évaluation nécessaire.</p>}
      {type !== 'premier5k' && !evaluation && <Message type="info">Ce type de plan a besoin d’une évaluation de votre niveau (onglet Profil).</Message>}
      {choix.length > 0 && (
        <Champ libelle="Distance">
          <select value={choix.some((c) => String(c.m) === distance) ? distance : String(choix[0].m)} onChange={(e) => setDistance(e.target.value)}>
            {choix.map((c) => (
              <option key={c.m} value={c.m}>
                {c.nom}
              </option>
            ))}
          </select>
        </Champ>
      )}
      {libre && (
        <div className="deux-colonnes">
          <Champ libelle="Distance (km)">
            <input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder={type === 'cross' ? '9' : '25'} />
          </Champ>
          {type === 'trail' && (
            <Champ libelle="Dénivelé positif (m)">
              <input inputMode="numeric" value={denivele} onChange={(e) => setDenivele(e.target.value)} placeholder="1200" />
            </Champ>
          )}
        </div>
      )}
      <div className="deux-colonnes">
        <Champ libelle="Date de la course">
          <input type="date" value={date} min={jour} onChange={(e) => setDate(e.target.value)} required />
        </Champ>
        {type !== 'premier5k' && (
          <Champ libelle="Temps visé" aide="Facultatif.">
            <input value={temps} onChange={(e) => setTemps(e.target.value)} placeholder="45:00" />
          </Champ>
        )}
      </div>
      <Champ libelle="Nom de la course" aide="Facultatif.">
        <input value={nom} onChange={(e) => setNom(e.target.value)} />
      </Champ>
      {erreur && <Message type="erreur">{erreur}</Message>}
      <div className="boutons">
        <button type="submit" className="bouton bouton-principal">
          Créer mon plan
        </button>
        {fermer && (
          <button type="button" className="bouton" onClick={fermer}>
            Annuler
          </button>
        )}
      </div>
    </form>
  )
}

function ResumeObjectif() {
  const { objectif, evaluation, jour } = useCoach()
  if (!objectif) return null
  const jours = joursEntre(jour, objectif.date)
  const effortM = distanceEffort(objectif)
  let prediction: { min: number; max: number } | null = null
  if (evaluation) {
    // Fourchette entre deux modèles : Daniels & Gilbert (1979) et Riegel (1981).
    const a = predireTemps(evaluation.vdot, effortM)
    const b = predireRiegel(evaluation.distanceM, evaluation.dureeS, effortM)
    prediction = { min: Math.min(a, b), max: Math.max(a, b) }
  }
  const realisme = evaluation && objectif.tempsViseS ? evaluerRealisme(evaluation.vdot, calculerVdot(effortM, objectif.tempsViseS), Math.max(0, jours) / 7) : null
  return (
    <>
      <p className="chiffres">
        <span>
          <strong>{jours > 0 ? `J−${jours}` : jours === 0 ? 'Jour J' : 'Passé'}</strong> {formaterDate(objectif.date)} {objectif.date.slice(0, 4)}
        </span>
        {objectif.tempsViseS && (
          <span>
            <strong>{formaterDuree(objectif.tempsViseS)}</strong> visé
          </span>
        )}
      </p>
      {prediction && (
        <p>
          Avec votre niveau actuel :{' '}
          {prediction.max / prediction.min < 1.01 ? `environ ${formaterDuree((prediction.min + prediction.max) / 2)}` : `entre ${formaterDuree(prediction.min)} et ${formaterDuree(prediction.max)}`}.
          {objectif.type === 'trail' && ' Estimation à partir de l’énergie dépensée : en trail, la technique et les descentes la rendent optimiste.'}
          {objectif.type === 'cross' && ' Sur terrain gras ou vallonné, comptez davantage.'}
        </p>
      )}
      {realisme && <Message type={realisme === 'peuRealiste' ? 'erreur' : 'info'}>{TEXTES_REALISME[realisme]}</Message>}
    </>
  )
}

export function EcranPlan() {
  const { objectif, plan, allures, donnees, jour, reajusterPlan } = useCoach()
  const [edition, setEdition] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const faites = useMemo(() => new Set(donnees.activites.map((a) => a.seanceId)), [donnees.activites])

  if (!objectif || !plan || edition) {
    return (
      <>
        <h1>{objectif ? 'Changer d’objectif' : 'Votre objectif'}</h1>
        <Carte>
          <FormulaireObjectif {...(objectif ? { fermer: () => setEdition(false) } : {})} />
        </Carte>
      </>
    )
  }

  async function reajuster() {
    if (!window.confirm('Refaire le plan à partir d’aujourd’hui, avec votre niveau actuel et le volume que vous avez réellement couru ces dernières semaines ?')) return
    try {
      await reajusterPlan()
      setMessage('Plan réajusté.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Le plan n’a pas pu être refait.')
    }
  }

  return (
    <>
      <h1>Plan</h1>
      <Carte titre={objectif.nom} accent>
        <ResumeObjectif />
        <div className="boutons">
          <button type="button" className="bouton" onClick={() => setEdition(true)}>
            Changer d’objectif
          </button>
          <button type="button" className="bouton" onClick={reajuster}>
            Réajuster le plan
          </button>
        </div>
        {message && <Message type="info">{message}</Message>}
      </Carte>
      {plan.avertissements.map((a) => (
        <Message key={a} type="info">
          {a}
        </Message>
      ))}
      {plan.semaines.map((s) => {
        const courante = joursEntre(s.debut, jour) >= 0 && joursEntre(s.debut, jour) < 7
        return (
          <details key={s.numero} className="semaine" open={courante}>
            <summary>
              <span className="semaine-titre">
                Semaine {s.numero}
                {courante && <span className="etiquette">en cours</span>}
                {s.allegee && <span className="etiquette">allégée</span>}
              </span>
              <span className="semaine-info">
                {NOMS_PHASES[s.phase]} · {Math.round(s.volumeKm)} km · du {formaterDate(s.debut, false)}
              </span>
            </summary>
            {s.seances.length === 0 ? (
              <p className="aide">Pas de séance prévue.</p>
            ) : (
              <ul className="seances">
                {s.seances.map((x) => (
                  <LigneSeance key={x.id} seance={x} allures={allures} faite={faites.has(x.id)} />
                ))}
              </ul>
            )}
          </details>
        )
      })}
    </>
  )
}
