import { formaterDate, joursEntre } from '../domaine/dates'
import { zonesFc } from '../domaine/fc'
import { formaterDuree } from '../domaine/format'
import { bilansHebdo, calculerAlertes, repartitionRecente } from '../domaine/suivi'
import { predireTemps } from '../domaine/vdot'
import { Barres, Carte, Message } from './composants'
import { useCoach } from './Etat'

const COURSES = [
  { nom: '1500 m', m: 1500 },
  { nom: '5 km', m: 5000 },
  { nom: '10 km', m: 10000 },
  { nom: 'Semi-marathon', m: 21097.5 },
  { nom: 'Marathon', m: 42195 },
]

/** "2026-11-16" → "16/11". */
function jourMois(date: string): string {
  return `${Number(date.slice(8))}/${Number(date.slice(5, 7))}`
}

export function EcranSuivi() {
  const { donnees, plan, jour, evaluation, fcMax } = useCoach()
  const bilans = bilansHebdo(donnees.activites, plan, jour, 8)
  const alertes = calculerAlertes(donnees.activites, plan, jour)
  const repartition = repartitionRecente(donnees.activites, plan, jour)
  const aDesCharges = bilans.some((b) => b.charge !== null)
  const derniere = bilans[bilans.length - 2]

  const zones = [0, 0, 0, 0, 0]
  for (const a of donnees.activites) {
    const ecart = joursEntre(a.date, jour)
    if (ecart >= 0 && ecart < 28 && a.tempsZonesS) a.tempsZonesS.forEach((s, i) => (zones[i] += s))
  }
  const totalZones = zones.reduce((s, z) => s + z, 0)
  const evaluations = [...donnees.evaluations].sort((a, b) => a.date.localeCompare(b.date))

  if (donnees.activites.length === 0 && !evaluation) {
    return (
      <>
        <h1>Suivi</h1>
        <p className="aide">Le suivi se remplira avec vos séances : kilométrage, charge, équilibre entre séances faciles et dures.</p>
      </>
    )
  }

  return (
    <>
      <h1>Suivi</h1>
      {alertes.length === 0 ? (
        donnees.activites.length > 0 && <Message type="succes">Aucun signal d’alerte sur vos dernières semaines.</Message>
      ) : (
        alertes.map((a) => (
          <Message key={a.titre} type="erreur">
            <strong>{a.titre}.</strong> {a.detail} <small>({a.source})</small>
          </Message>
        ))
      )}

      <Carte titre="Kilomètres par semaine">
        <Barres unite="km" donnees={bilans.map((b, i) => ({ etiquette: jourMois(b.debut), valeur: b.km, repere: b.kmPrevus, courante: i === bilans.length - 1 }))} />
        <p className="aide">8 dernières semaines, la dernière barre est la semaine en cours. Le trait indique le volume prévu par le plan.</p>
      </Carte>

      {aDesCharges && (
        <Carte titre="Charge par semaine">
          <Barres unite="points" donnees={bilans.map((b, i) => ({ etiquette: jourMois(b.debut), valeur: b.charge ?? 0, courante: i === bilans.length - 1 }))} />
          <p className="aide">
            Charge = ressenti × minutes, additionnée sur la semaine (Foster, 2001).
            {derniere?.monotonie != null && ` Monotonie de la semaine dernière : ${derniere.monotonie.toFixed(1).replace('.', ',')} (à garder sous 2).`}
          </p>
        </Carte>
      )}

      {repartition.total > 0 && (
        <Carte titre="Équilibre des 4 dernières semaines">
          <div className="repartition" role="img" aria-label={`${repartition.facile} séances faciles, ${repartition.seuil} au seuil, ${repartition.intense} intenses`}>
            {(['facile', 'seuil', 'intense'] as const).map((c) => repartition[c] > 0 && <span key={c} className={`part part-${c}`} style={{ flexGrow: repartition[c] }} />)}
          </div>
          <p className="legende">
            <span className="point point-facile" /> {repartition.facile} faciles
            <span className="point point-seuil" /> {repartition.seuil} au seuil
            <span className="point point-intense" /> {repartition.intense} intenses
          </p>
          <p className="aide">Repère : environ 80 % de séances faciles chez les coureurs d’endurance qui progressent (Seiler &amp; Kjerland, 2006). Les séances sans ressenti ni lien avec le plan ne sont pas comptées.</p>
        </Carte>
      )}

      {totalZones > 0 && fcMax && (
        <Carte titre="Temps par zone cardiaque (4 semaines)">
          <table>
            <tbody>
              {zonesFc(fcMax).map((z, i) => (
                <tr key={z.numero}>
                  <th scope="row">
                    Zone {z.numero} · {z.nom}
                  </th>
                  <td>{formaterDuree(zones[i])}</td>
                  <td>{Math.round((zones[i] / totalZones) * 100)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="aide">Calculé à partir des fichiers .fit.</p>
        </Carte>
      )}

      {evaluation && (
        <Carte titre="Niveau et temps possibles">
          {evaluations.length > 1 && (
            <ul className="liste">
              {evaluations.map((e) => (
                <li key={e.id} className="liste-ligne">
                  <span>
                    {formaterDate(e.date, false)} {e.date.slice(0, 4)}
                  </span>
                  <strong>VMA {String(e.vmaKmh).replace('.', ',')}</strong>
                </li>
              ))}
            </ul>
          )}
          <table>
            <caption>Temps équivalents à votre dernière évaluation</caption>
            <tbody>
              {COURSES.map((c) => (
                <tr key={c.m}>
                  <th scope="row">{c.nom}</th>
                  <td>{formaterDuree(predireTemps(evaluation.vdot, c.m))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="aide">Équivalences du modèle de Daniels &amp; Gilbert (1979). Elles supposent un entraînement adapté à la distance : un chrono sur 5 km ne garantit pas le marathon correspondant.</p>
        </Carte>
      )}
    </>
  )
}
