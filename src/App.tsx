import { useState } from 'react'
import { Message } from './ui/composants'
import { Questionnaire } from './ui/Questionnaire'
import { EcranAujourdhui } from './ui/EcranAujourdhui'
import { EcranJournal } from './ui/EcranJournal'
import { EcranPlan } from './ui/EcranPlan'
import { EcranProfil } from './ui/EcranProfil'
import { EcranSeance } from './ui/EcranSeance'
import type { SeancePrevue } from './domaine/modele'
import { EcranSuivi } from './ui/EcranSuivi'
import { FournisseurCoach, useCoach } from './ui/Etat'
import { reponsesVides } from './domaine/questionnaire'
import { ONGLETS, type Onglet } from './ui/onglets'

function Interieur() {
  const { pret, erreur, profil } = useCoach()
  const [onglet, setOnglet] = useState<Onglet>('aujourdhui')
  // Séance ouverte en plein écran : déroulé, ou saisie directe du ressenti.
  const [enCours, setEnCours] = useState<{ seance: SeancePrevue; direct: boolean } | null>(null)
  const [accueil, setAccueil] = useState(true)

  if (erreur) {
    return (
      <main>
        <Message type="erreur">{erreur}</Message>
      </main>
    )
  }
  if (!pret) return <main aria-busy="true" />

  if (!profil) {
    return (
      <main>
        {accueil ? (
          <>
            <p className="surtitre">Bienvenue</p>
            <h1>Coach Course</h1>
            <p>Un plan d’entraînement à votre mesure, du premier 5 km au marathon. Vos données restent sur cet appareil : pas de compte, pas de serveur.</p>
            <p>Quelques questions pour faire connaissance : comptez moins de 5 minutes.</p>
            <button type="button" className="bouton bouton-principal" onClick={() => setAccueil(false)}>
              Commencer
            </button>
            <p className="aide">Cette appli ne remplace pas un avis médical. En cas de doute sur votre santé, consultez avant de commencer.</p>
          </>
        ) : (
          <Questionnaire depart={reponsesVides()} />
        )}
      </main>
    )
  }

  if (enCours) return <EcranSeance seance={enCours.seance} direct={enCours.direct} fermer={() => setEnCours(null)} />

  function aller(o: Onglet) {
    setOnglet(o)
    window.scrollTo(0, 0)
  }

  return (
    <>
      <main>
        {onglet === 'aujourdhui' && <EcranAujourdhui aller={aller} lancer={(seance, direct) => setEnCours({ seance, direct })} />}
        {onglet === 'plan' && <EcranPlan />}
        {onglet === 'journal' && <EcranJournal />}
        {onglet === 'suivi' && <EcranSuivi />}
        {onglet === 'profil' && <EcranProfil />}
      </main>
      <nav className="onglets" aria-label="Navigation principale">
        {ONGLETS.map((o) => (
          <button key={o.id} type="button" className={o.id === onglet ? 'onglet onglet-actif' : 'onglet'} aria-current={o.id === onglet ? 'page' : undefined} onClick={() => aller(o.id)}>
            {o.nom}
          </button>
        ))}
      </nav>
    </>
  )
}

export default function App() {
  return (
    <FournisseurCoach>
      <Interieur />
    </FournisseurCoach>
  )
}
