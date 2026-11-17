// Tableau de bord : 6 graphiques au plus, la comparaison du prévu et du
// réalisé, et les exports CSV et PDF.

import { type DateIso, formaterDate } from '../domaine/dates'
import { formaterDistance, formaterDuree } from '../domaine/format'
import { serieEnCours } from '../domaine/motivation'
import { bilansHebdo, calculerAlertes, repartitionRecente } from '../domaine/suivi'
import { type Comparaison, comparerPrevuRealise, historiqueNiveau, regulariteHebdo, serieRpe, synthetiser } from '../domaine/tableauDeBord'
import { exporterCsv } from '../donnees/csv'
import { Carte, Message } from './composants'
import { useCoach } from './Etat'
import { BarreSegmentee, Colonnes, Courbe, Halteres } from './graphiques'

const NB_SEMAINES = 8

/** "2026-11-16" → "16/11". */
function jourMois(date: DateIso): string {
  return `${Number(date.slice(8))}/${Number(date.slice(5, 7))}`
}

const fr = (n: number) => String(n).replace('.', ',')

function telecharger(nom: string, contenu: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([contenu], { type }))
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nom
  lien.click()
  URL.revokeObjectURL(url)
}

function LignePrevuRealise({ ligne }: { ligne: Comparaison }) {
  const { prevue, activite: a, statut, ecartRpe } = ligne
  return (
    <li className="pr-ligne">
      <span className="pr-date">{jourMois(ligne.date)}</span>
      <span className="pr-texte">
        <strong>{prevue?.titre ?? 'Sortie hors plan'}</strong>
        <small>
          {statut === 'manquee' && `Manquée · ${fr(prevue!.distanceKm)} km étaient prévus`}
          {a && prevue && `${fr(prevue.distanceKm)} km prévus · ${formaterDistance(a.distanceM)} en ${formaterDuree(a.dureeS)}`}
          {a && !prevue && `${formaterDistance(a.distanceM)} en ${formaterDuree(a.dureeS)}`}
        </small>
      </span>
      <span className="pr-rpe">
        {a?.rpe !== undefined && prevue ? (
          <>
            {a.rpe}
            <small> / {prevue.rpeVise} prévu</small>
          </>
        ) : statut === 'manquee' ? (
          <small>–</small>
        ) : (
          a?.rpe !== undefined && a.rpe
        )}
        {ecartRpe !== null && Math.abs(ecartRpe) >= 2 && <span className="pr-ecart">{ecartRpe > 0 ? `+${ecartRpe}` : ecartRpe}</span>}
      </span>
    </li>
  )
}

export function EcranSuivi() {
  const { donnees, plan, objectif, jour, evaluation, profil } = useCoach()
  const { activites } = donnees
  const bilans = bilansHebdo(activites, plan, jour, NB_SEMAINES)
  const regularite = regulariteHebdo(plan, activites, jour, NB_SEMAINES)
  const alertes = calculerAlertes(activites, plan, jour, profil?.volumeHebdoKm)
  const repartition = repartitionRecente(activites, plan, jour)
  const rpe = serieRpe(plan, activites, 12)
  const niveaux = historiqueNiveau(donnees.evaluations)
  const comparaisons = comparerPrevuRealise(plan, activites, jour)
  const synthese = synthetiser(comparaisons)
  const serie = serieEnCours(activites, plan, jour)
  const derniere = bilans[bilans.length - 2]

  if (activites.length === 0 && !evaluation) {
    return (
      <>
        <h1>Tableau de bord</h1>
        <p className="aide">Il se remplira avec vos séances : volume, charge, équilibre des intensités, ressenti prévu et réel, niveau, régularité.</p>
      </>
    )
  }

  async function exporterPdf() {
    // Le bilan n'est construit qu'à la demande : son code n'est chargé qu'à ce moment-là.
    const { construireRapport } = await import('../donnees/rapport')
    telecharger(`coach-course-bilan-${jour}.pdf`, construireRapport({ donnees, plan, objectif, evaluation, jour }), 'application/pdf')
  }

  return (
    <>
      <h1>Tableau de bord</h1>
      {alertes.map((a) => (
        <Message key={a.titre} type="erreur">
          <strong>{a.titre}.</strong> {a.detail} <small>({a.source})</small>
        </Message>
      ))}

      {comparaisons.length > 0 && (
        <Carte titre="Prévu et réalisé">
          <p className="chiffres">
            {synthese.seancesPrevues > 0 ? (
              <>
                <span>
                  <strong>
                    {synthese.seancesFaites} / {synthese.seancesPrevues}
                  </strong>{' '}
                  séances faites
                </span>
                <span>
                  <strong>{fr(Math.round(synthese.kmRealises))}</strong> km sur {fr(Math.round(synthese.kmPrevus))} prévus
                </span>
              </>
            ) : (
              <span>
                <strong>{synthese.seancesHorsPlan}</strong> sortie{synthese.seancesHorsPlan > 1 ? 's' : ''} hors plan · <strong>{fr(Math.round(synthese.kmRealises))}</strong> km
              </span>
            )}
            {synthese.ecartRpeMoyen !== null && (
              <span>
                <strong>{synthese.ecartRpeMoyen > 0 ? `+${fr(synthese.ecartRpeMoyen)}` : fr(synthese.ecartRpeMoyen)}</strong> de ressenti
              </span>
            )}
          </p>
          <ul className="pr-liste">
            {[...comparaisons]
              .reverse()
              .slice(0, 6)
              .map((l) => (
                <LignePrevuRealise key={`${l.date}-${l.prevue?.id ?? l.activite?.id}`} ligne={l} />
              ))}
          </ul>
          <p className="aide">Les dernières séances. À droite : ressenti réel, puis ressenti prévu ; l’écart est signalé à partir de 2 points. Tout le détail est dans les exports.</p>
          <div className="boutons">
            <button type="button" className="bouton" onClick={() => telecharger(`coach-course-seances-${jour}.csv`, exporterCsv(comparaisons), 'text/csv;charset=utf-8')}>
              Exporter en CSV
            </button>
            <button type="button" className="bouton" onClick={exporterPdf}>
              Exporter en PDF
            </button>
          </div>
        </Carte>
      )}

      <Carte titre="Volume par semaine">
        <Colonnes
          titre="Kilomètres par semaine, réalisés et prévus"
          unite="km"
          entetes={plan ? ['Semaine du', 'Prévu', 'Réalisé'] : ['Semaine du', 'Réalisé']}
          donnees={bilans.map((b) => ({
            etiquette: jourMois(b.debut),
            valeur: b.km,
            repere: b.kmPrevus,
            detail: `Semaine du ${formaterDate(b.debut, false)} : ${fr(b.km)} km${b.kmPrevus !== null ? ` pour ${Math.round(b.kmPrevus)} prévus` : ''}.`,
          }))}
        />
      </Carte>

      {bilans.some((b) => b.charge !== null) && (
        <Carte titre="Charge par semaine">
          <Colonnes
            titre="Charge d’entraînement par semaine"
            unite="points"
            entetes={['Semaine du', 'Charge']}
            donnees={bilans.map((b) => ({ etiquette: jourMois(b.debut), valeur: b.charge ?? 0, detail: `Semaine du ${formaterDate(b.debut, false)} : ${b.charge === null ? 'aucun ressenti noté' : `${b.charge} points`}.` }))}
          />
          <p className="aide">
            Charge = ressenti × minutes, additionnée sur la semaine (Foster et al., 2001).
            {derniere?.monotonie != null && ` Monotonie de la semaine dernière : ${fr(Math.round(derniere.monotonie * 10) / 10)} (à garder sous 2).`}
          </p>
        </Carte>
      )}

      {repartition.total > 0 && (
        <Carte titre="Répartition des intensités">
          <BarreSegmentee
            titre="Séances des 4 dernières semaines par intensité"
            parts={[
              { cle: 'facile', nom: 'Faciles', valeur: repartition.facile },
              { cle: 'seuil', nom: 'Au seuil', valeur: repartition.seuil },
              { cle: 'intense', nom: 'Intenses', valeur: repartition.intense },
            ]}
          />
          <p className="aide">4 dernières semaines. Repère : environ 80 % de séances faciles chez les coureurs d’endurance qui progressent (Seiler &amp; Kjerland, 2006).</p>
        </Carte>
      )}

      {rpe.length > 0 && (
        <Carte titre="Ressenti prévu et réalisé">
          <Halteres
            titre="Ressenti prévu et ressenti réel des dernières séances"
            donnees={rpe.map((p) => ({ etiquette: jourMois(p.date), prevu: p.rpeVise, realise: p.rpe, detail: `${formaterDate(p.date, false)} · ${p.titre} : prévu ${p.rpeVise}, ressenti ${p.rpe}.` }))}
          />
          <p className="aide">Un point au-dessus de son anneau : la séance a été plus dure que prévu. Deux fois en deux semaines, l’appli propose d’alléger le plan.</p>
        </Carte>
      )}

      {niveaux.length > 0 && (
        <Carte titre="Évolution du niveau">
          {niveaux.length === 1 ? (
            <p className="chiffres">
              <span>
                <strong>{fr(niveaux[0].vdot)}</strong> de VDOT
              </span>
              <span>
                <strong>{fr(niveaux[0].vmaKmh)}</strong> km/h de VMA
              </span>
            </p>
          ) : (
            <Courbe
              titre="VDOT au fil des évaluations"
              entetes={['Date', 'VDOT']}
              donnees={niveaux.map((e) => ({ etiquette: jourMois(e.date), valeur: e.vdot, detail: `${formaterDate(e.date, false)} ${e.date.slice(0, 4)} : VDOT ${fr(e.vdot)}, VMA ${fr(e.vmaKmh)} km/h${e.fiabilite === 'bonne' ? '' : ` (fiabilité ${e.fiabilite})`}.` }))}
            />
          )}
          <p className="aide">{niveaux.length === 1 ? 'Une seule évaluation pour l’instant : la courbe apparaîtra à la suivante. Un test toutes les 4 à 6 semaines suffit.' : 'Le VDOT résume votre niveau à partir d’une performance (Daniels & Gilbert, 1979).'}</p>
        </Carte>
      )}

      {plan && regularite.some((r) => r.prevues > 0) && (
        <Carte titre="Régularité">
          <Colonnes
            titre="Part des séances prévues réalisées, par semaine"
            unite="%"
            maximum={100}
            entetes={['Semaine du', 'Séances faites']}
            donnees={regularite.map((r) => ({
              etiquette: jourMois(r.debut),
              valeur: r.taux === null ? 0 : Math.round(r.taux * 100),
              detail: `Semaine du ${formaterDate(r.debut, false)} : ${r.prevues === 0 ? 'rien de prévu' : `${r.faites} séance${r.faites > 1 ? 's' : ''} sur ${r.prevues}`}.`,
            }))}
          />
          <p className="aide">
            Série en cours : {serie} semaine{serie > 1 ? 's' : ''} avec au moins 2 séances.
          </p>
        </Carte>
      )}
    </>
  )
}
