import { type ChangeEvent, type FormEvent, useState } from 'react'
import { formaterDate } from '../domaine/dates'
import { type SaisieEvaluation, evaluer } from '../domaine/evaluation'
import { zonesFc } from '../domaine/fc'
import { formaterAllure, formaterDistance, formaterDuree, lireDuree } from '../domaine/format'
import type { TypeEvaluation } from '../domaine/modele'
import { dureeDansDomaineValide, predireTemps } from '../domaine/vdot'
import { ErreurSauvegarde, exporter, importer } from '../donnees/sauvegarde'
import { Carte, Champ, Message } from './composants'
import { nouvelId, useCoach } from './Etat'
import { NOMS_JOURS } from '../domaine/dates'
import { calculerBadges, meilleureSerie, palierActuel } from '../domaine/motivation'
import { reponsesDepuis } from '../domaine/questionnaire'
import { Questionnaire } from './Questionnaire'
import { NOMS_EVALUATIONS } from './texte'

const DISTANCES = [
  { nom: '1500 m', m: 1500 },
  { nom: '3000 m', m: 3000 },
  { nom: '5 km', m: 5000 },
  { nom: '10 km', m: 10000 },
  { nom: 'Semi-marathon', m: 21097.5 },
  { nom: 'Marathon', m: 42195 },
]

/** Les évaluations qu'on peut saisir ici ; l'estimation par l'allure de footing vient du questionnaire. */
type TypeTest = Exclude<TypeEvaluation, 'footing'>
const TYPES_TEST: TypeTest[] = ['course', 'demiCooper', 'vameval']

export function FormulaireEvaluation() {
  const { ajouterEvaluation, jour } = useCoach()
  const [type, setType] = useState<TypeTest>('course')
  const [date, setDate] = useState(jour)
  const [distance, setDistance] = useState('5000')
  const [autre, setAutre] = useState('')
  const [temps, setTemps] = useState('')
  const [metres, setMetres] = useState('')
  const [palier, setPalier] = useState('')
  const [message, setMessage] = useState<{ type: 'erreur' | 'succes' | 'info'; texte: string } | null>(null)

  async function valider(e: FormEvent) {
    e.preventDefault()
    let saisie: SaisieEvaluation
    let avertissement = ''
    if (type === 'course') {
      const distanceM = distance === 'autre' ? Number(autre.replace(',', '.')) * 1000 : Number(distance)
      const dureeS = lireDuree(temps)
      if (!(distanceM >= 800)) return setMessage({ type: 'erreur', texte: 'Indiquez une distance d’au moins 800 m.' })
      if (!dureeS) return setMessage({ type: 'erreur', texte: 'Écrivez le temps sous la forme 20:00 ou 1:31:35.' })
      const vitesse = distanceM / 1000 / (dureeS / 3600)
      if (vitesse < 4 || vitesse > 26) return setMessage({ type: 'erreur', texte: 'Ce chrono ne correspond pas à une course à pied. Vérifiez la distance et le temps.' })
      if (!dureeDansDomaineValide(dureeS)) avertissement = ' Attention : hors de la plage de 3 min 30 à 4 h, l’estimation est moins fiable.'
      saisie = { type, distanceM, dureeS }
    } else if (type === 'demiCooper') {
      const m = Number(metres)
      if (!(m >= 500 && m <= 2600)) return setMessage({ type: 'erreur', texte: 'Indiquez la distance parcourue en 6 minutes, en mètres (par exemple 1450).' })
      saisie = { type, distanceM: m }
    } else {
      const v = Number(palier.replace(',', '.'))
      if (!(v >= 7 && v <= 26)) return setMessage({ type: 'erreur', texte: 'Indiquez la vitesse du dernier palier terminé, en km/h (par exemple 14,5).' })
      saisie = { type, vitessePalierKmh: v }
    }
    const evaluation = evaluer(saisie, date, nouvelId())
    await ajouterEvaluation(evaluation)
    setMessage({ type: avertissement ? 'info' : 'succes', texte: `Niveau enregistré : VMA ${String(evaluation.vmaKmh).replace('.', ',')} km/h.${avertissement}` })
    setTemps('')
    setMetres('')
    setPalier('')
  }

  return (
    <form onSubmit={valider} className="formulaire">
      <Champ libelle="Type d’évaluation">
        <select value={type} onChange={(e) => setType(e.target.value as TypeTest)}>
          {TYPES_TEST.map((t) => (
            <option key={t} value={t}>
              {NOMS_EVALUATIONS[t]}
            </option>
          ))}
        </select>
      </Champ>
      {type === 'course' && (
        <>
          <p className="aide">Une course ou un chrono récent, couru à fond, de préférence sur terrain plat.</p>
          <div className="deux-colonnes">
            <Champ libelle="Distance">
              <select value={distance} onChange={(e) => setDistance(e.target.value)}>
                {DISTANCES.map((d) => (
                  <option key={d.m} value={d.m}>
                    {d.nom}
                  </option>
                ))}
                <option value="autre">Autre</option>
              </select>
            </Champ>
            {distance === 'autre' && (
              <Champ libelle="Distance (km)">
                <input inputMode="decimal" value={autre} onChange={(e) => setAutre(e.target.value)} />
              </Champ>
            )}
            <Champ libelle="Temps">
              <input value={temps} onChange={(e) => setTemps(e.target.value)} placeholder="20:00" inputMode="text" />
            </Champ>
          </div>
        </>
      )}
      {type === 'demiCooper' && (
        <>
          <p className="aide">Après 15 min d’échauffement, courez la plus grande distance possible en 6 minutes, à allure régulière, sur une piste.</p>
          <Champ libelle="Distance parcourue (m)">
            <input inputMode="numeric" value={metres} onChange={(e) => setMetres(e.target.value)} placeholder="1450" />
          </Champ>
        </>
      )}
      {type === 'vameval' && (
        <>
          <p className="aide">Test progressif sur piste avec bande sonore, souvent organisé en club : +0,5 km/h chaque minute.</p>
          <Champ libelle="Vitesse du dernier palier terminé (km/h)">
            <input inputMode="decimal" value={palier} onChange={(e) => setPalier(e.target.value)} placeholder="14,5" />
          </Champ>
        </>
      )}
      <Champ libelle="Date">
        <input type="date" value={date} max={jour} onChange={(e) => setDate(e.target.value)} required />
      </Champ>
      {message && <Message type={message.type}>{message.texte}</Message>}
      <button type="submit" className="bouton bouton-principal">
        Enregistrer l’évaluation
      </button>
    </form>
  )
}

function Sauvegarde() {
  const { donnees, restaurer, jour } = useCoach()
  const [message, setMessage] = useState<{ type: 'erreur' | 'succes'; texte: string } | null>(null)

  function telecharger() {
    const url = URL.createObjectURL(new Blob([exporter(donnees, jour)], { type: 'application/json' }))
    const lien = document.createElement('a')
    lien.href = url
    lien.download = `coach-course-${jour}.json`
    lien.click()
    URL.revokeObjectURL(url)
  }

  async function charger(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier) return
    try {
      const nouvelles = importer(await fichier.text())
      if (!window.confirm('Remplacer toutes les données de cet appareil par celles de la sauvegarde ?')) return
      await restaurer(nouvelles)
      setMessage({ type: 'succes', texte: 'Sauvegarde restaurée.' })
    } catch (err) {
      setMessage({ type: 'erreur', texte: err instanceof ErreurSauvegarde ? err.message : 'La restauration a échoué.' })
    }
  }

  return (
    <Carte titre="Sauvegarde">
      <p>Vos données ne quittent pas cet appareil. Faites une sauvegarde de temps en temps : si le navigateur efface ses données, elles seraient perdues.</p>
      <div className="boutons">
        <button type="button" className="bouton" onClick={telecharger}>
          Télécharger une sauvegarde
        </button>
        <label className="bouton">
          Restaurer une sauvegarde
          <input type="file" accept="application/json,.json" onChange={charger} hidden />
        </label>
      </div>
      {message && <Message type={message.type}>{message.texte}</Message>}
    </Carte>
  )
}

const NOMS_NIVEAUX = { 1: 'Débutant', 2: 'Intermédiaire', 3: 'Confirmé' }

export function EcranProfil() {
  const { donnees, profil, objectif, plan, jour, evaluation, allures, fcMax, fcMaxEstimee, supprimerEvaluation } = useCoach()
  const [edition, setEdition] = useState(false)
  const evaluations = [...donnees.evaluations].sort((a, b) => b.date.localeCompare(a.date))
  if (!profil) return null
  if (edition) return <Questionnaire depart={reponsesDepuis(profil, objectif, evaluation)} terminer={() => setEdition(false)} />
  const terrains = [profil.terrains.piste ? 'piste' : '', profil.terrains.cotes ? 'côte' : '', profil.terrains.chemins ? 'chemins' : ''].filter(Boolean)
  return (
    <>
      <h1>Profil</h1>
      <Carte titre={profil.prenom || 'Vous'}>
        <dl className="bilan">
          <div>
            <dt>Niveau</dt>
            <dd>{NOMS_NIVEAUX[profil.niveau]}</dd>
          </div>
          <div>
            <dt>Volume de départ</dt>
            <dd>{profil.volumeHebdoKm} km par semaine</dd>
          </div>
          <div>
            <dt>Jours d’entraînement</dt>
            <dd>{profil.joursDisponibles.map((j) => NOMS_JOURS[j]).join(', ')}</dd>
          </div>
          <div>
            <dt>Terrains</dt>
            <dd>{terrains.length > 0 ? terrains.join(', ') : 'route uniquement'}</dd>
          </div>
        </dl>
        {(profil.blessureRecente || profil.alerteSante) && <Message type="erreur">Vous avez signalé {profil.alerteSante ? 'un signal de santé' : 'une blessure récente'} : consultez avant d’augmenter la charge.</Message>}
        <button type="button" className="bouton" onClick={() => window.confirm('Refaire le questionnaire recrée votre plan à partir d’aujourd’hui. Continuer ?') && setEdition(true)}>
          Modifier mes réponses
        </button>
      </Carte>

      <Carte titre="Votre niveau">
        {evaluation && allures ? (
          <>
            <p className="chiffres">
              <span>
                <strong>{String(evaluation.vmaKmh).replace('.', ',')}</strong> km/h de VMA
              </span>
              <span>
                <strong>{String(evaluation.vdot).replace('.', ',')}</strong> de VDOT
              </span>
            </p>
            <table>
              <caption>Vos allures d’entraînement</caption>
              <tbody>
                <tr>
                  <th scope="row">Endurance</th>
                  <td>
                    {formaterDuree(allures.E.rapide)} à {formaterAllure(allures.E.lente)}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Marathon</th>
                  <td>{formaterAllure(allures.M)}</td>
                </tr>
                <tr>
                  <th scope="row">Seuil</th>
                  <td>{formaterAllure(allures.T)}</td>
                </tr>
                <tr>
                  <th scope="row">Intervalles (VMA longue)</th>
                  <td>{formaterAllure(allures.I)}</td>
                </tr>
                <tr>
                  <th scope="row">Répétitions</th>
                  <td>{formaterAllure(allures.R)}</td>
                </tr>
              </tbody>
            </table>
            <table>
              <caption>Temps équivalents sur d’autres distances</caption>
              <tbody>
                {DISTANCES.map((d) => (
                  <tr key={d.m}>
                    <th scope="row">{d.nom}</th>
                    <td>{formaterDuree(predireTemps(evaluation.vdot, d.m))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="aide">Équivalences du modèle de Daniels &amp; Gilbert (1979). Elles supposent un entraînement adapté à la distance : un chrono sur 5 km ne garantit pas le marathon correspondant.</p>
          </>
        ) : (
          <p>Pas encore d’évaluation. Elle sert à calculer vos allures. Si vous débutez, vous pouvez vous en passer pour le programme « Mon premier 5 km ».</p>
        )}
        <h3>Nouvelle évaluation</h3>
        <FormulaireEvaluation />
        {evaluations.length > 0 && (
          <>
            <h3>Historique</h3>
            <ul className="liste">
              {evaluations.map((e) => (
                <li key={e.id} className="liste-ligne">
                  <span>
                    {formaterDate(e.date, false)} {e.date.slice(0, 4)} · {NOMS_EVALUATIONS[e.type]}
                    <br />
                    <small>
                      {formaterDistance(e.distanceM)} en {formaterDuree(e.dureeS)} · VMA {String(e.vmaKmh).replace('.', ',')}
                    </small>
                  </span>
                  <button type="button" className="lien" onClick={() => window.confirm('Supprimer cette évaluation ?') && supprimerEvaluation(e.id)}>
                    Supprimer
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Carte>

      {fcMax && (
        <Carte titre="Zones de fréquence cardiaque">
          <table>
            <tbody>
              {zonesFc(fcMax).map((z) => (
                <tr key={z.numero}>
                  <th scope="row">
                    Zone {z.numero} · {z.nom}
                  </th>
                  <td>
                    {z.min} à {z.max}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="aide">
            FC max {fcMaxEstimee ? `estimée par l’âge : ${fcMax} (Tanaka, 2001). L’erreur peut atteindre 10 battements : mesurez-la si possible.` : `mesurée : ${fcMax}.`} Zones en % de FC max (Seiler, 2010).
          </p>
        </Carte>
      )}

      <Carte titre="Badges">
        <p className="aide">
          Palier {palierActuel(donnees.activites).numero} · {palierActuel(donnees.activites).nom} · meilleure série : {meilleureSerie(donnees.activites, plan)} semaine(s)
        </p>
        <ul className="badges">
          {calculerBadges(donnees.activites, plan, jour).map((b) => (
            <li key={b.id} className={b.obtenu ? 'badge badge-obtenu' : 'badge'}>
              <span className="medaille" aria-hidden="true" />
              <span>
                <strong>{b.nom}</strong>
                <br />
                <small>
                  {b.description} {b.obtenu ? 'Obtenu.' : `${b.actuel} sur ${b.cible}.`}
                </small>
              </span>
            </li>
          ))}
        </ul>
      </Carte>

      <Sauvegarde />

      <Carte titre="À propos">
        <p>Coach Course propose un entraînement à partir de règles publiées et de pratiques d’entraîneur. Ce n’est pas un avis médical : en cas de douleur, de malaise ou de reprise après un arrêt long, consultez un professionnel de santé.</p>
        <details>
          <summary>Sources des règles d’entraînement</summary>
          <ul className="sources">
            <li>Niveau et allures : Daniels &amp; Gilbert (1979) ; Daniels (2014).</li>
            <li>Second avis sur les temps : Riegel (1981).</li>
            <li>VMA : Billat &amp; Koralsztein (1996) ; Cazorla &amp; Léger (1993).</li>
            <li>FC max et zones : Tanaka et al. (2001) ; Seiler (2010) ; Karvonen et al. (1957).</li>
            <li>Répartition des intensités : Seiler &amp; Kjerland (2006) ; Stöggl &amp; Sperlich (2014).</li>
            <li>Charge et ressenti : Foster (1998 ; 2001) ; Banister (1975 ; 1991).</li>
            <li>Progression : Nielsen et al. (2014) ; Buist et al. (2008).</li>
            <li>Périodisation et affûtage : Bompa &amp; Buzzichelli (2018) ; Bosquet et al. (2007) ; Mujika &amp; Padilla (2000 ; 2003).</li>
            <li>Dénivelé : Minetti et al. (2002).</li>
            <li>Fractionné et côtes : Billat (2001) ; Barnes et al. (2013).</li>
            <li>Renforcement : Blagrove et al. (2018).</li>
            <li>Santé avant de commencer : Warburton et al. (2011) ; Riebe et al. (2015).</li>
            <li>Ravitaillement : Thomas, Erdman &amp; Burke (2016).</li>
          </ul>
          <p className="aide">Modèle volontairement écarté : le ratio de charge aiguë / chronique (ACWR, Gabbett, 2016), dont la valeur prédictive est contestée (Lolli et al., 2019 ; Impellizzeri et al., 2020).</p>
          <p className="aide">Plusieurs réglages (durée des phases, semaine allégée, plafonds de volume, programme marche-course) relèvent de la pratique d’entraîneur, sans étude précise derrière eux. Ils sont signalés comme tels dans le code.</p>
        </details>
      </Carte>
    </>
  )
}
