import { type ChangeEvent, type FormEvent, useMemo, useState } from 'react'
import { formaterDate } from '../domaine/dates'
import { distanceEquivalenteApprochee } from '../domaine/denivele'
import { formaterAllure, formaterDistance, formaterDuree, lireDuree } from '../domaine/format'
import { type Activite, VERSION_DONNEES } from '../domaine/modele'
import { toutesLesSeances } from '../domaine/suivi'
import { Carte, Champ, Message } from './composants'
import { nouvelId, useCoach } from './Etat'
import { NOMS_RPE } from './texte'

function ChoixRpe({ valeur, choisir }: { valeur: number | undefined; choisir: (rpe: number) => void }) {
  return (
    <div className="rpe">
      <div className="rpe-boutons" role="group" aria-label="Ressenti de la séance, de 0 à 10">
        {NOMS_RPE.map((nom, i) => (
          <button key={i} type="button" className={valeur === i ? 'rpe-bouton rpe-actif' : 'rpe-bouton'} aria-pressed={valeur === i} aria-label={`${i} : ${nom}`} onClick={() => choisir(i)}>
            {i}
          </button>
        ))}
      </div>
      <span className="champ-aide">{valeur === undefined ? 'Comment avez-vous ressenti la séance dans son ensemble ?' : `${valeur} : ${NOMS_RPE[valeur]}`}</span>
    </div>
  )
}

function FormulaireSeance({ seanceId, fermer }: { seanceId: string | null; fermer: () => void }) {
  const { plan, jour, enregistrerActivite } = useCoach()
  const prevue = toutesLesSeances(plan).find((s) => s.id === seanceId)
  const [date, setDate] = useState(prevue && prevue.date <= jour ? prevue.date : jour)
  const [km, setKm] = useState(prevue ? String(prevue.distanceKm).replace('.', ',') : '')
  const [duree, setDuree] = useState('')
  const [fc, setFc] = useState('')
  const [denivele, setDenivele] = useState('')
  const [rpe, setRpe] = useState<number | undefined>(undefined)
  const [commentaire, setCommentaire] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  async function valider(e: FormEvent) {
    e.preventDefault()
    const distanceM = Number(km.replace(',', '.')) * 1000
    const dureeS = lireDuree(duree)
    if (!(distanceM > 0 && distanceM < 300000)) return setErreur('Indiquez la distance en km.')
    if (!dureeS) return setErreur('Écrivez la durée sous la forme 45:00 ou 1:05:00 (un nombre seul compte en minutes).')
    const fcMoy = Number(fc)
    const dPlus = Number(denivele)
    const activite: Activite = {
      id: nouvelId(),
      version: VERSION_DONNEES,
      date,
      source: 'manuel',
      distanceM: Math.round(distanceM),
      dureeS,
      tours: [],
      commentaire: commentaire.trim(),
      ...(fcMoy > 30 ? { fcMoy } : {}),
      ...(dPlus > 0 ? { denivelePosM: dPlus, deniveleNegM: dPlus, distanceEquivPlatM: Math.round(distanceEquivalenteApprochee(distanceM, dPlus)) } : {}),
      ...(rpe !== undefined ? { rpe } : {}),
      ...(prevue && prevue.date === date ? { seanceId: prevue.id } : {}),
    }
    await enregistrerActivite(activite)
    fermer()
  }

  return (
    <Carte titre={prevue ? `Séance réalisée : ${prevue.titre}` : 'Saisir une séance'}>
      <form onSubmit={valider} className="formulaire">
        <Champ libelle="Date">
          <input type="date" value={date} max={jour} onChange={(e) => setDate(e.target.value)} required />
        </Champ>
        <div className="deux-colonnes">
          <Champ libelle="Distance (km)">
            <input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder="8,5" />
          </Champ>
          <Champ libelle="Durée">
            <input value={duree} onChange={(e) => setDuree(e.target.value)} placeholder="48:30" />
          </Champ>
        </div>
        <div className="deux-colonnes">
          <Champ libelle="FC moyenne" aide="Facultatif.">
            <input inputMode="numeric" value={fc} onChange={(e) => setFc(e.target.value)} />
          </Champ>
          <Champ libelle="Dénivelé positif (m)" aide="Facultatif.">
            <input inputMode="numeric" value={denivele} onChange={(e) => setDenivele(e.target.value)} />
          </Champ>
        </div>
        <div className="champ">
          <span className="champ-libelle">Ressenti</span>
          <ChoixRpe valeur={rpe} choisir={setRpe} />
        </div>
        <Champ libelle="Commentaire" aide="Facultatif.">
          <textarea rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
        </Champ>
        {erreur && <Message type="erreur">{erreur}</Message>}
        <div className="boutons">
          <button type="submit" className="bouton bouton-principal">
            Enregistrer
          </button>
          <button type="button" className="bouton" onClick={fermer}>
            Annuler
          </button>
        </div>
      </form>
    </Carte>
  )
}

function CarteActivite({ activite }: { activite: Activite }) {
  const { plan, enregistrerActivite, supprimerActivite } = useCoach()
  const prevue = toutesLesSeances(plan).find((s) => s.id === activite.seanceId)
  const allure = activite.distanceM > 0 ? activite.dureeS / (activite.distanceM / 1000) : null
  return (
    <li className="carte activite">
      <div className="activite-tete">
        <strong>{formaterDate(activite.date)}</strong>
        <span className="etiquette">{activite.source === 'fit' ? '.fit' : 'saisie'}</span>
      </div>
      {prevue && <p className="aide">Prévu : {prevue.titre}</p>}
      <p className="chiffres">
        <span>
          <strong>{formaterDistance(activite.distanceM)}</strong>
        </span>
        <span>
          <strong>{formaterDuree(activite.dureeS)}</strong>
        </span>
        {allure && (
          <span>
            <strong>{formaterAllure(allure)}</strong>
          </span>
        )}
      </p>
      <p className="aide">
        {[
          activite.fcMoy ? `FC moy. ${activite.fcMoy}` : null,
          activite.denivelePosM ? `D+ ${activite.denivelePosM} m` : null,
          activite.distanceEquivPlatM && activite.denivelePosM ? `équivaut à ${formaterDistance(activite.distanceEquivPlatM)} à plat` : null,
          activite.trimp ? `TRIMP ${activite.trimp}` : null,
          activite.tours.length > 1 ? `${activite.tours.length} tours` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {activite.tours.length > 1 && (
        <details>
          <summary>Voir les tours</summary>
          <table>
            <tbody>
              {activite.tours.map((t, i) => (
                <tr key={i}>
                  <th scope="row">{i + 1}</th>
                  <td>{formaterDistance(t.distanceM)}</td>
                  <td>{formaterDuree(t.dureeS)}</td>
                  <td>{t.distanceM > 0 ? formaterAllure(t.dureeS / (t.distanceM / 1000)) : ''}</td>
                  <td>{t.fcMoy ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <ChoixRpe valeur={activite.rpe} choisir={(rpe) => enregistrerActivite({ ...activite, rpe })} />
      {activite.commentaire && <p>{activite.commentaire}</p>}
      <button type="button" className="lien" onClick={() => window.confirm('Supprimer cette séance du journal ?') && supprimerActivite(activite.id)}>
        Supprimer
      </button>
    </li>
  )
}

export function EcranJournal({ seanceASaisir, terminerSaisie }: { seanceASaisir: string | null; terminerSaisie: () => void }) {
  const { donnees, plan, profil, fcMax, enregistrerActivite } = useCoach()
  const [saisie, setSaisie] = useState(seanceASaisir !== null)
  const [messages, setMessages] = useState<{ type: 'erreur' | 'succes' | 'info'; texte: string }[]>([])
  const activites = useMemo(() => [...donnees.activites].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), [donnees.activites])

  async function importer(e: ChangeEvent<HTMLInputElement>) {
    const fichiers = [...(e.target.files ?? [])]
    e.target.value = ''
    const retours: typeof messages = []
    const connues = [...donnees.activites]
    // Le SDK Garmin est volumineux : il n'est chargé qu'au premier import.
    const { ErreurFit, lireFichierFit } = await import('../fit/lireFit')
    for (const fichier of fichiers) {
      try {
        const resume = await lireFichierFit(fichier, {
          ...(fcMax ? { fcMax } : {}),
          ...(profil?.fcRepos ? { fcRepos: profil.fcRepos } : {}),
          ...(profil?.sexe ? { sexe: profil.sexe } : {}),
        })
        if (connues.some((a) => a.date === resume.date && a.dureeS === resume.dureeS && a.distanceM === resume.distanceM)) {
          retours.push({ type: 'info', texte: `${fichier.name} : déjà dans le journal.` })
          continue
        }
        // Rattachement à la séance prévue le même jour, si elle est encore libre.
        const prises = new Set(connues.map((a) => a.seanceId))
        const prevue = toutesLesSeances(plan).find((s) => s.date === resume.date && !prises.has(s.id))
        const activite: Activite = { ...resume, id: nouvelId(), version: VERSION_DONNEES, commentaire: '', nomFichier: fichier.name, ...(prevue ? { seanceId: prevue.id } : {}) }
        await enregistrerActivite(activite)
        connues.push(activite)
        retours.push({ type: 'succes', texte: `${fichier.name} : ${formaterDistance(resume.distanceM)} le ${formaterDate(resume.date)}. Pensez à noter votre ressenti.` })
      } catch (err) {
        retours.push({ type: 'erreur', texte: `${fichier.name} : ${err instanceof ErreurFit ? err.message : 'lecture impossible.'}` })
      }
    }
    setMessages(retours)
  }

  function fermer() {
    setSaisie(false)
    terminerSaisie()
  }

  return (
    <>
      <h1>Journal</h1>
      {saisie ? (
        <FormulaireSeance seanceId={seanceASaisir} fermer={fermer} />
      ) : (
        <div className="boutons">
          <label className="bouton bouton-principal">
            Importer des fichiers .fit
            <input type="file" accept=".fit" multiple onChange={importer} hidden />
          </label>
          <button type="button" className="bouton" onClick={() => setSaisie(true)}>
            Saisir une séance
          </button>
        </div>
      )}
      {messages.map((m, i) => (
        <Message key={i} type={m.type}>
          {m.texte}
        </Message>
      ))}
      {activites.length === 0 ? (
        <p className="aide">Aucune séance pour l’instant. Importez le fichier .fit de votre montre (Garmin, Coros, Suunto, Wahoo…) ou saisissez la séance à la main.</p>
      ) : (
        <ul className="activites">
          {activites.map((a) => (
            <CarteActivite key={a.id} activite={a} />
          ))}
        </ul>
      )}
    </>
  )
}
