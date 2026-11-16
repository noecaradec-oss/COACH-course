import { formaterDate, joursEntre } from '../domaine/dates'
import { zonesFc } from '../domaine/fc'
import { calculerAlertes, seanceDuJour, toutesLesSeances } from '../domaine/suivi'
import { Carte, DetailSeance, LigneSeance, Message, Pastille } from './composants'
import { useCoach } from './Etat'
import type { Onglet } from './onglets'

export function EcranAujourdhui({ aller, saisir }: { aller: (o: Onglet) => void; saisir: (seanceId: string) => void }) {
  const { profil, evaluation, objectif, plan, allures, fcMax, donnees, jour } = useCoach()
  const seance = seanceDuJour(plan, jour, donnees.activites)
  // Une sortie notée aujourd'hui compte, même hors plan.
  const faiteAujourdhui = donnees.activites.some((a) => a.date === jour)
  const prochaines = toutesLesSeances(plan)
    .filter((s) => s.date > jour)
    .slice(0, 3)
  const alertes = calculerAlertes(donnees.activites, plan, jour)
  const joursRestants = objectif ? joursEntre(jour, objectif.date) : null
  const zones = fcMax ? zonesFc(fcMax) : null

  return (
    <>
      <p className="surtitre">{formaterDate(jour)}</p>
      <h1>{profil?.prenom ? `Bonjour ${profil.prenom}` : 'Bonjour'}</h1>

      {!evaluation && !plan && (
        <Carte titre="Par où commencer">
          <p>Deux chemins possibles :</p>
          <div className="boutons">
            <button type="button" className="bouton bouton-principal" onClick={() => aller('profil')}>
              J’ai un chrono : évaluer mon niveau
            </button>
            <button type="button" className="bouton" onClick={() => aller('plan')}>
              Je débute : mon premier 5 km
            </button>
          </div>
        </Carte>
      )}
      {evaluation && !plan && (
        <Carte titre="Choisissez un objectif">
          <p>Votre niveau est connu. Il reste à choisir une course pour construire votre plan.</p>
          <button type="button" className="bouton bouton-principal" onClick={() => aller('plan')}>
            Choisir mon objectif
          </button>
        </Carte>
      )}

      {plan && objectif && joursRestants !== null && joursRestants < 0 && (
        <Carte titre="Objectif passé">
          <p>{objectif.nom} est derrière vous. Récupérez une à deux semaines en footing facile, notez votre chrono comme nouvelle évaluation, puis choisissez le prochain objectif.</p>
          <button type="button" className="bouton bouton-principal" onClick={() => aller('plan')}>
            Nouvel objectif
          </button>
        </Carte>
      )}

      {seance && (
        <Carte accent>
          <div className="seance-tete">
            <h2>{seance.titre}</h2>
            <Pastille categorie={seance.categorie} />
          </div>
          <p className="aide">
            Environ {String(seance.distanceKm).replace('.', ',')} km · {seance.dureeMin} min
          </p>
          <DetailSeance seance={seance} allures={allures} />
          {zones && seance.categorie === 'facile' && seance.type !== 'marcheCourse' && (
            <p className="aide">
              Repère cardiaque : restez en zones 1 et 2, sous {zones[1].max} battements par minute.
            </p>
          )}
          <button type="button" className="bouton bouton-principal" onClick={() => saisir(seance.id)}>
            C’est fait : noter la séance
          </button>
        </Carte>
      )}
      {plan && !seance && joursRestants !== null && joursRestants >= 0 && (
        <Carte titre={faiteAujourdhui ? 'Séance du jour faite' : 'Repos aujourd’hui'}>
          <p>{faiteAujourdhui ? 'Bien joué. Hydratez-vous et mangez dans l’heure.' : 'Le repos fait partie de l’entraînement : c’est là que le corps progresse.'}</p>
        </Carte>
      )}

      {alertes.map((a) => (
        <Message key={a.titre} type="erreur">
          <strong>{a.titre}.</strong> {a.detail} <small>({a.source})</small>
        </Message>
      ))}

      {prochaines.length > 0 && (
        <Carte titre="À venir">
          <ul className="seances">
            {prochaines.map((s) => (
              <LigneSeance key={s.id} seance={s} allures={allures} faite={false} />
            ))}
          </ul>
          {objectif && joursRestants !== null && joursRestants >= 0 && (
            <p className="aide">
              {objectif.nom} : dans {joursRestants} jour{joursRestants > 1 ? 's' : ''}.
            </p>
          )}
        </Carte>
      )}
    </>
  )
}
