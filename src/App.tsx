import { useState } from 'react'
import { Message } from './ui/composants'
import { Questionnaire } from './ui/Questionnaire'
import { EcranAujourdhui } from './ui/EcranAujourdhui'
import { EcranJournal } from './ui/EcranJournal'
import { EcranPlan } from './ui/EcranPlan'
import { EcranProfil } from './ui/EcranProfil'
import { EcranSuivi } from './ui/EcranSuivi'
import { FournisseurCoach, useCoach } from './ui/Etat'
import { reponsesVides } from './domaine/questionnaire'
import { ONGLETS, type Onglet } from './ui/onglets'

function Interieur() {
  const { pret, erreur, profil } = useCoach()
  const [onglet, setOnglet] = useState<Onglet>('aujourdhui')
  const [seanceASaisir, setSeanceASaisir] = useState<string | null>(null)
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

  function aller(o: Onglet) {
    setOnglet(o)
    window.scrollTo(0, 0)
  }

  return (
    <>
      <main>
        {onglet === 'aujourdhui' && (
          <EcranAujourdhui
            aller={aller}
            saisir={(id) => {
              setSeanceASaisir(id)
              aller('journal')
            }}
          />
        )}
        {onglet === 'plan' && <EcranPlan />}
        {onglet === 'journal' && <EcranJournal key={seanceASaisir ?? 'libre'} seanceASaisir={seanceASaisir} terminerSaisie={() => setSeanceASaisir(null)} />}
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
