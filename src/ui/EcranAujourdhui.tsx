import { useState } from 'react'
import { conseilPour, contexteDe } from '../domaine/conseils'
import { formaterDate, joursEntre } from '../domaine/dates'
import { zonesFc } from '../domaine/fc'
import type { SeancePrevue } from '../domaine/modele'
import { calculerBadges, palierActuel, serieEnCours } from '../domaine/motivation'
import { diagnostiquer } from '../domaine/reajustement'
import { ficheParId } from '../domaine/seances'
import { calculerAlertes, seanceDuJour, toutesLesSeances } from '../domaine/suivi'
import { Carte, DetailSeance, LigneSeance, Message, Pastille } from './composants'
import { useCoach } from './Etat'
import type { Onglet } from './onglets'

function Motivation() {
  const { donnees, plan, jour } = useCoach()
  const serie = serieEnCours(donnees.activites, plan, jour)
  const palier = palierActuel(donnees.activites)
  const badges = calculerBadges(donnees.activites, plan, jour)
  const obtenus = badges.filter((b) => b.obtenu).length
  // Le badge le plus proche d'être obtenu, pour donner un cap.
  const prochain = badges.filter((b) => !b.obtenu).sort((a, b) => b.actuel / b.cible - a.actuel / a.cible)[0]
  return (
    <section className="motivation" aria-label="Votre progression">
      <div className="motivation-chiffres">
        <span>
          <strong>{serie}</strong> semaine{serie > 1 ? 's' : ''} de suite
        </span>
        <span>
          <strong>{obtenus}</strong> badge{obtenus > 1 ? 's' : ''} sur {badges.length}
        </span>
        <span>
          Palier <strong>{palier.numero}</strong>
        </span>
      </div>
      <div className="jauge" role="img" aria-label={`Palier ${palier.numero}, ${palier.nom} : ${palier.km} km${palier.prochainKm ? ` sur ${palier.prochainKm}` : ''}`}>
        <span style={{ width: `${Math.round(palier.avancement * 100)}%` }} />
      </div>
      <p className="aide">
        {palier.nom} · {palier.km} km{palier.prochainKm ? ` sur ${palier.prochainKm}` : ''}
        {prochain && ` · Prochain badge : ${prochain.nom} (${prochain.actuel}/${prochain.cible})`}
      </p>
    </section>
  )
}

function CarteSeance({ seance, lancer }: { seance: SeancePrevue; lancer: (seance: SeancePrevue, direct: boolean) => void }) {
  const { plan, profil, objectif, allures, fcMax, donnees } = useCoach()
  const [detail, setDetail] = useState(false)
  if (!plan || !profil) return null
  const fiche = ficheParId(seance.ficheId)
  const conseil = conseilPour(seance, contexteDe(seance, plan, donnees.activites, profil, objectif))
  const zones = fcMax && profil.materiel.cardio ? zonesFc(fcMax) : null
  return (
    <Carte accent>
      <div className="seance-tete">
        <h2 className="seance-titre">{seance.titre}</h2>
        <Pastille categorie={seance.categorie} />
      </div>
      <p className="seance-mesures">
        {seance.distanceKm > 0 && `${String(seance.distanceKm).replace('.', ',')} km · `}
        {seance.dureeMin} min · ressenti visé {seance.rpeVise}/10
      </p>
      <p>{seance.consigne}</p>
      <p className="conseil">
        <strong>Le conseil du jour.</strong> {conseil}
      </p>
      {zones && seance.categorie === 'facile' && seance.type !== 'marcheCourse' && <p className="aide">Repère cardiaque : restez sous {zones[1].max} battements par minute.</p>}
      <button type="button" className="bouton bouton-principal bouton-grand" onClick={() => lancer(seance, false)}>
        Commencer la séance
      </button>
      <div className="boutons boutons-secondaires">
        <button type="button" className="bouton" onClick={() => lancer(seance, true)}>
          Déjà faite : noter mon ressenti
        </button>
        <button type="button" className="bouton" aria-expanded={detail} onClick={() => setDetail(!detail)}>
          {detail ? 'Masquer le détail' : 'Voir le détail'}
        </button>
      </div>
      {detail && (
        <>
          <DetailSeance seance={seance} allures={allures} sansConsigne />
          {fiche && (
            <dl className="variantes">
              <div>
                <dt>Plus facile</dt>
                <dd>{fiche.variantes.plusFacile}</dd>
              </div>
              <div>
                <dt>Plus dur</dt>
                <dd>{fiche.variantes.plusDure}</dd>
              </div>
            </dl>
          )}
        </>
      )}
    </Carte>
  )
}

function PropositionAjustement() {
  const { plan, donnees, jour, reajusterPlan } = useCoach()
  const [etat, setEtat] = useState<'attente' | 'fait' | 'erreur'>('attente')
  if (!plan) return null
  const diagnostic = diagnostiquer(plan, donnees.activites, jour)
  if (etat === 'fait') return <Message type="succes">Plan ajusté. Les séances à venir ont été recalculées.</Message>
  if (!diagnostic.necessaire && diagnostic.conseils.length === 0) return null

  async function ajuster() {
    try {
      await reajusterPlan()
      setEtat('fait')
    } catch {
      setEtat('erreur')
    }
  }

  return (
    <Carte titre={diagnostic.necessaire ? 'Votre plan mérite un ajustement' : 'À noter'}>
      {diagnostic.raisons.map((r) => (
        <p key={r}>{r}</p>
      ))}
      {diagnostic.conseils.map((c) => (
        <p key={c} className="aide">
          {c}
        </p>
      ))}
      {diagnostic.necessaire && (
        <button type="button" className="bouton bouton-principal" onClick={ajuster}>
          Ajuster mon plan
        </button>
      )}
      {etat === 'erreur' && <Message type="erreur">L’ajustement a échoué. Réessayez depuis l’onglet Plan.</Message>}
    </Carte>
  )
}

export function EcranAujourdhui({ aller, lancer }: { aller: (o: Onglet) => void; lancer: (seance: SeancePrevue, direct: boolean) => void }) {
  const { profil, evaluation, objectif, plan, allures, donnees, jour } = useCoach()
  const seance = seanceDuJour(plan, jour, donnees.activites)
  // Une sortie notée aujourd'hui compte, même hors plan.
  const faiteAujourdhui = donnees.activites.some((a) => a.date === jour)
  const prochaines = toutesLesSeances(plan)
    .filter((s) => s.date > jour)
    .slice(0, 3)
  const alertes = calculerAlertes(donnees.activites, plan, jour, profil?.volumeHebdoKm)
  const joursRestants = objectif ? joursEntre(jour, objectif.date) : null

  return (
    <>
      <p className="surtitre">{formaterDate(jour)}</p>
      <h1>{profil?.prenom ? `Bonjour ${profil.prenom}` : 'Bonjour'}</h1>

      {seance && <CarteSeance seance={seance} lancer={lancer} />}

      {!plan && (
        <Carte titre={evaluation ? 'Choisissez un objectif' : 'Il manque votre niveau'}>
          <p>{evaluation ? 'Votre niveau est connu. Il reste à choisir une course pour construire votre plan.' : 'Sans chrono, les allures ne peuvent pas être calculées. Faites un test de 6 minutes et saisissez-le, ou choisissez le programme « Mon premier 5 km ».'}</p>
          <div className="boutons">
            {!evaluation && (
              <button type="button" className="bouton bouton-principal" onClick={() => aller('profil')}>
                Saisir une évaluation
              </button>
            )}
            <button type="button" className={evaluation ? 'bouton bouton-principal' : 'bouton'} onClick={() => aller('plan')}>
              Choisir mon objectif
            </button>
          </div>
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

      {plan && !seance && joursRestants !== null && joursRestants >= 0 && (
        <Carte titre={faiteAujourdhui ? 'Séance du jour faite' : 'Repos aujourd’hui'}>
          <p>{faiteAujourdhui ? 'Bien joué. Hydratez-vous et mangez dans l’heure.' : 'Le repos fait partie de l’entraînement : c’est là que le corps progresse. Votre série ne s’arrête pas pour autant.'}</p>
        </Carte>
      )}

      <Motivation />
      <PropositionAjustement />

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
