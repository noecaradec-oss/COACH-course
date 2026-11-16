// Petits composants partagés par les écrans.

import { type ReactNode, useState } from 'react'
import { formaterDate } from '../domaine/dates'
import { formaterDuree } from '../domaine/format'
import type { SeancePrevue } from '../domaine/modele'
import type { Allures } from '../domaine/vdot'
import { NOMS_CATEGORIES, NOMS_PARTIES, decrireBloc } from './texte'

export function Carte({ titre, children, accent }: { titre?: string; children: ReactNode; accent?: boolean }) {
  return (
    <section className={accent ? 'carte carte-accent' : 'carte'}>
      {titre && <h2>{titre}</h2>}
      {children}
    </section>
  )
}

export function Champ({ libelle, aide, children }: { libelle: string; aide?: string; children: ReactNode }) {
  return (
    <label className="champ">
      <span className="champ-libelle">{libelle}</span>
      {children}
      {aide && <span className="champ-aide">{aide}</span>}
    </label>
  )
}

export function Message({ type, children }: { type: 'erreur' | 'info' | 'succes'; children: ReactNode }) {
  return (
    <p className={`message message-${type}`} role={type === 'erreur' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

export function Pastille({ categorie }: { categorie: SeancePrevue['categorie'] }) {
  return <span className={`pastille pastille-${categorie}`}>{NOMS_CATEGORIES[categorie]}</span>
}

/** Contenu détaillé d'une séance : blocs traduits en allures, consigne. */
export function DetailSeance({ seance, allures, sansConsigne = false }: { seance: SeancePrevue; allures: Allures | null; sansConsigne?: boolean }) {
  // Les blocs sont regroupés par partie : échauffement, séance, retour au calme, complément.
  const parties: { nom: string; blocs: SeancePrevue['blocs'] }[] = []
  for (const b of seance.blocs) {
    const nom = NOMS_PARTIES[b.partie ?? 'corps']
    if (parties.at(-1)?.nom === nom) parties.at(-1)!.blocs.push(b)
    else parties.push({ nom, blocs: [b] })
  }
  return (
    <div className="detail-seance">
      {seance.type === 'course' ? (
        <p>
          {String(seance.distanceKm).replace('.', ',')} km · temps estimé à votre niveau actuel : {formaterDuree(seance.dureeMin * 60)}
        </p>
      ) : (
        parties.map((partie) => (
          <div key={partie.nom}>
            {parties.length > 1 && <h3 className="partie">{partie.nom}</h3>}
            <ul>
              {partie.blocs.map((b, i) => (
                <li key={i}>{decrireBloc(b, allures)}</li>
              ))}
            </ul>
          </div>
        ))
      )}
      {!sansConsigne && <p className="consigne">{seance.consigne}</p>}
    </div>
  )
}

export function LigneSeance({
  seance,
  allures,
  faite,
  ouverteAuDepart = false,
}: {
  seance: SeancePrevue
  allures: Allures | null
  faite: boolean
  ouverteAuDepart?: boolean
}) {
  const [ouverte, setOuverte] = useState(ouverteAuDepart)
  return (
    <li className="ligne-seance">
      <button type="button" className="ligne-seance-tete" aria-expanded={ouverte} onClick={() => setOuverte(!ouverte)}>
        <span className={`point point-${seance.categorie}`} aria-hidden="true" />
        <span className="ligne-seance-texte">
          <span className="ligne-seance-date">{formaterDate(seance.date)}</span>
          <span className="ligne-seance-titre">{seance.titre}</span>
        </span>
        <span className="ligne-seance-mesure">
          {faite ? <span className="fait">Fait</span> : `${String(seance.distanceKm).replace('.', ',')} km`}
        </span>
      </button>
      {ouverte && <DetailSeance seance={seance} allures={allures} />}
    </li>
  )
}
