// La séance en cours : déroulé étape par étape, puis saisie du ressenti et
// récompenses. Écran pensé pour être lu dehors, en mouvement : noir sur
// blanc, très gros caractères, gros boutons, aucune information secondaire.

import { useEffect, useMemo, useRef, useState } from 'react'
import { type Etape, etapesDe } from '../domaine/deroule'
import { formaterDistance, formaterDuree, lireDuree } from '../domaine/format'
import { type Activite, type SeancePrevue, VERSION_DONNEES } from '../domaine/modele'
import { type Badge, ECHELLE_RPE, calculerBadges, nouveauxBadges, serieEnCours } from '../domaine/motivation'
import { Champ } from './composants'
import { nouvelId, useCoach } from './Etat'

function mesure(etape: Etape, resteS: number | null): string {
  if (etape.dureeS !== undefined) return formaterDuree(resteS ?? etape.dureeS)
  return formaterDistance(etape.distanceM ?? 0)
}

/** Garde l'écran allumé pendant la séance, quand le téléphone le permet. */
function useEcranAllume(actif: boolean) {
  useEffect(() => {
    if (!actif || !('wakeLock' in navigator)) return
    let verrou: WakeLockSentinel | null = null
    let annule = false
    navigator.wakeLock
      .request('screen')
      .then((v) => {
        if (annule) void v.release()
        else verrou = v
      })
      .catch(() => {
        // Refusé (économie d'énergie, onglet en arrière-plan) : la séance continue sans.
      })
    return () => {
      annule = true
      void verrou?.release()
    }
  }, [actif])
}

function Deroule({ seance, terminer, quitter }: { seance: SeancePrevue; terminer: (dureeMesureeS: number | null) => void; quitter: () => void }) {
  const { allures } = useCoach()
  const etapes = useMemo(() => etapesDe(seance, allures), [seance, allures])
  const [rang, setRang] = useState(0)
  const [enMarche, setEnMarche] = useState(false)
  // Le compte à rebours repose sur l'heure de fin, pas sur des tics : il reste
  // juste même si le téléphone met la page en veille quelques secondes.
  const [finA, setFinA] = useState<number | null>(null)
  const [resteS, setResteS] = useState<number | null>(null)
  const debut = useRef<number | null>(null)
  const etape = etapes[rang]
  const suivante = etapes[rang + 1]
  useEcranAllume(enMarche)

  function allerA(nouveauRang: number, continuer: boolean) {
    if (nouveauRang >= etapes.length) return terminer(debut.current ? Math.round((Date.now() - debut.current) / 1000) : null)
    const prochaine = etapes[Math.max(0, nouveauRang)]
    setRang(Math.max(0, nouveauRang))
    setResteS(null)
    const chrono = continuer && prochaine.dureeS !== undefined
    setFinA(chrono ? Date.now() + prochaine.dureeS! * 1000 : null)
    setEnMarche(chrono)
  }

  useEffect(() => {
    if (!enMarche || finA === null) return
    const tic = () => {
      const reste = Math.max(0, Math.ceil((finA - Date.now()) / 1000))
      setResteS(reste)
      if (reste === 0) {
        navigator.vibrate?.([200, 100, 200])
        allerA(rang + 1, true)
      }
    }
    tic()
    const minuterie = window.setInterval(tic, 250)
    return () => window.clearInterval(minuterie)
    // allerA ne lit que l'état listé ci-dessous.
  }, [enMarche, finA, rang])

  function demarrerOuPause() {
    debut.current ??= Date.now()
    if (enMarche) {
      setEnMarche(false)
      setFinA(null)
    } else {
      setFinA(Date.now() + (resteS ?? etape.dureeS ?? 0) * 1000)
      setEnMarche(true)
    }
  }

  const chronometree = etape.dureeS !== undefined
  return (
    <div className={`soleil soleil-${etape.genre}`}>
      <header className="soleil-tete">
        <button type="button" className="soleil-lien" onClick={quitter}>
          Quitter
        </button>
        <span>
          {etape.partie} · étape {rang + 1} / {etapes.length}
        </span>
        <button type="button" className="soleil-lien" onClick={() => terminer(debut.current ? Math.round((Date.now() - debut.current) / 1000) : null)}>
          Terminer
        </button>
      </header>
      <div className="soleil-progression" role="progressbar" aria-valuemin={1} aria-valuemax={etapes.length} aria-valuenow={rang + 1} aria-label="Avancement de la séance">
        <span style={{ width: `${((rang + 1) / etapes.length) * 100}%` }} />
      </div>

      <div className="soleil-centre" aria-live="polite">
        <p className="soleil-titre">{etape.titre}</p>
        {etape.repetition && <p className="soleil-repetition">{etape.repetition}</p>}
        <p className="soleil-mesure">{mesure(etape, resteS)}</p>
        {etape.detail && <p className="soleil-detail">{etape.detail}</p>}
      </div>

      <p className="soleil-suite">{suivante ? `Ensuite : ${suivante.titre.toLowerCase()}, ${mesure(suivante, null)}` : 'Dernière étape'}</p>

      <div className="soleil-boutons">
        {chronometree && (
          <button type="button" className="soleil-bouton soleil-bouton-plein" onClick={demarrerOuPause}>
            {enMarche ? 'Pause' : resteS !== null ? 'Reprendre' : 'Démarrer'}
          </button>
        )}
        <button
          type="button"
          className={chronometree ? 'soleil-bouton' : 'soleil-bouton soleil-bouton-plein'}
          onClick={() => {
            debut.current ??= Date.now()
            allerA(rang + 1, enMarche || !chronometree)
          }}
        >
          {suivante ? (chronometree ? 'Suivant' : 'Fait, suivant') : 'Terminer la séance'}
        </button>
        {rang > 0 && (
          <button type="button" className="soleil-lien" onClick={() => allerA(rang - 1, false)}>
            Étape précédente
          </button>
        )}
      </div>
    </div>
  )
}

function Ressenti({ seance, dureeMesureeS, enregistrer, quitter }: { seance: SeancePrevue; dureeMesureeS: number | null; enregistrer: (a: Activite) => Promise<void>; quitter: () => void }) {
  const { jour } = useCoach()
  const [rpe, setRpe] = useState<number | null>(null)
  // On retient la durée mesurée si elle est plausible ; sinon la durée prévue, modifiable.
  const prevueS = seance.dureeMin * 60
  const plausible = dureeMesureeS !== null && dureeMesureeS > prevueS * 0.5 && dureeMesureeS < prevueS * 2
  const [duree, setDuree] = useState(formaterDuree(plausible ? dureeMesureeS : prevueS))
  const [km, setKm] = useState(String(seance.distanceKm).replace('.', ','))
  const [erreur, setErreur] = useState<string | null>(null)
  const niveau = rpe !== null ? ECHELLE_RPE[rpe - 1] : null

  async function valider() {
    if (rpe === null) return
    const dureeS = lireDuree(duree)
    const distanceM = Number(km.replace(',', '.')) * 1000
    if (!dureeS || !(distanceM >= 0)) return setErreur('Vérifiez la durée et la distance dans « Ajuster ».')
    await enregistrer({
      id: nouvelId(),
      version: VERSION_DONNEES,
      date: seance.date <= jour ? seance.date : jour,
      source: 'manuel',
      distanceM: Math.round(distanceM),
      dureeS,
      tours: [],
      commentaire: '',
      rpe,
      seanceId: seance.id,
    })
  }

  return (
    <div className="soleil">
      <header className="soleil-tete">
        <button type="button" className="soleil-lien" onClick={quitter}>
          Plus tard
        </button>
        <span>{seance.titre}</span>
        <span />
      </header>
      <div className="soleil-centre">
        <p className="soleil-question" id="rpe-question">
          Comment était la séance, dans l’ensemble ?
        </p>
        <p className="soleil-mesure" aria-live="polite">
          {rpe ?? '–'}
          <small> / 10</small>
        </p>
        <p className="soleil-titre">{niveau ? niveau.nom : 'Faites glisser ou touchez un chiffre'}</p>
        <p className="soleil-detail">{niveau ? niveau.repere : `Prévu pour cette séance : ${seance.rpeVise}`}</p>
      </div>
      <input className="soleil-curseur" type="range" min={1} max={10} step={1} value={rpe ?? seance.rpeVise} onChange={(e) => setRpe(Number(e.target.value))} aria-labelledby="rpe-question" aria-valuetext={niveau ? `${rpe} : ${niveau.nom}` : 'non renseigné'} />
      <div className="soleil-graduations">
        {ECHELLE_RPE.map((n) => (
          <button key={n.valeur} type="button" className={rpe === n.valeur ? 'soleil-chiffre soleil-chiffre-actif' : 'soleil-chiffre'} aria-label={`${n.valeur} : ${n.nom}`} aria-pressed={rpe === n.valeur} onClick={() => setRpe(n.valeur)}>
            {n.valeur}
          </button>
        ))}
      </div>
      <details className="soleil-ajuster">
        <summary>
          Ajuster : {km} km en {duree}
        </summary>
        <div className="deux-colonnes">
          <Champ libelle="Distance (km)">
            <input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
          </Champ>
          <Champ libelle="Durée">
            <input value={duree} onChange={(e) => setDuree(e.target.value)} />
          </Champ>
        </div>
        <p>Vous pourrez importer le fichier .fit de votre montre depuis le journal : il remplacera ces valeurs.</p>
      </details>
      {erreur && <p role="alert">{erreur}</p>}
      <div className="soleil-boutons">
        <button type="button" className="soleil-bouton soleil-bouton-plein" disabled={rpe === null} onClick={valider}>
          Enregistrer
        </button>
      </div>
    </div>
  )
}

function Bravo({ seance, rpe, badges, serie, fermer }: { seance: SeancePrevue; rpe: number; badges: Badge[]; serie: number; fermer: () => void }) {
  const ecart = rpe - seance.rpeVise
  const lecture =
    ecart >= 2
      ? 'Plus dur que prévu. Ce n’est pas grave une fois : la prochaine séance facile doit l’être vraiment.'
      : ecart <= -2
        ? 'Plus facile que prévu : bon signe. Ne changez rien aux allures sans nouvelle évaluation.'
        : 'Ressenti conforme à ce qui était prévu : la séance a fait son travail.'
  return (
    <div className="soleil">
      <div className="soleil-centre">
        <p className="soleil-titre">Séance enregistrée</p>
        <p className="soleil-detail">{lecture}</p>
        {serie > 0 && (
          <p className="soleil-serie">
            Série en cours : <strong>{serie}</strong> semaine{serie > 1 ? 's' : ''}
          </p>
        )}
        {badges.map((b) => (
          <div key={b.id} className="soleil-badge">
            <span className="medaille" aria-hidden="true" />
            <div>
              <strong>Nouveau badge : {b.nom}</strong>
              <br />
              {b.description}
            </div>
          </div>
        ))}
      </div>
      <div className="soleil-boutons">
        <button type="button" className="soleil-bouton soleil-bouton-plein" onClick={fermer}>
          Terminer
        </button>
      </div>
    </div>
  )
}

/**
 * `direct` : la séance est déjà faite, on passe tout de suite au ressenti.
 */
export function EcranSeance({ seance, direct, fermer }: { seance: SeancePrevue; direct: boolean; fermer: () => void }) {
  const { donnees, plan, jour, enregistrerActivite } = useCoach()
  const [etat, setEtat] = useState<'deroule' | 'ressenti' | 'bravo'>(direct ? 'ressenti' : 'deroule')
  const [dureeMesureeS, setDureeMesureeS] = useState<number | null>(null)
  const [bilan, setBilan] = useState<{ rpe: number; badges: Badge[]; serie: number } | null>(null)

  async function enregistrer(activite: Activite) {
    const avant = calculerBadges(donnees.activites, plan, jour)
    const apres = [...donnees.activites, activite]
    await enregistrerActivite(activite)
    setBilan({ rpe: activite.rpe!, badges: nouveauxBadges(avant, calculerBadges(apres, plan, jour)), serie: serieEnCours(apres, plan, jour) })
    setEtat('bravo')
  }

  if (etat === 'deroule') {
    return (
      <Deroule
        seance={seance}
        quitter={fermer}
        terminer={(d) => {
          setDureeMesureeS(d)
          setEtat('ressenti')
        }}
      />
    )
  }
  if (etat === 'ressenti' || !bilan) return <Ressenti seance={seance} dureeMesureeS={dureeMesureeS} enregistrer={enregistrer} quitter={fermer} />
  return <Bravo seance={seance} rpe={bilan.rpe} badges={bilan.badges} serie={bilan.serie} fermer={fermer} />
}
