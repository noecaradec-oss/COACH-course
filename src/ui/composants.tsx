// Petits composants partagés par les écrans.

import { type ReactNode, useState } from 'react'
import { formaterDate } from '../domaine/dates'
import { formaterDuree } from '../domaine/format'
import type { SeancePrevue } from '../domaine/modele'
import type { Allures } from '../domaine/vdot'
import { NOMS_CATEGORIES, decrireBloc } from './texte'

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
export function DetailSeance({ seance, allures }: { seance: SeancePrevue; allures: Allures | null }) {
  return (
    <div className="detail-seance">
      {seance.type === 'course' ? (
        <p>
          {String(seance.distanceKm).replace('.', ',')} km · temps estimé à votre niveau actuel : {formaterDuree(seance.dureeMin * 60)}
        </p>
      ) : (
        <ol>
          {seance.blocs.map((b, i) => (
            <li key={i}>{decrireBloc(b, allures, seance.type)}</li>
          ))}
        </ol>
      )}
      <p className="consigne">{seance.consigne}</p>
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

/** Barres verticales simples, avec repère optionnel (valeur prévue). */
export function Barres({
  donnees,
  unite,
}: {
  donnees: { etiquette: string; valeur: number; repere?: number | null; courante?: boolean }[]
  unite: string
}) {
  const max = Math.max(1, ...donnees.map((d) => Math.max(d.valeur, d.repere ?? 0)))
  const L = 320
  const H = 130
  const HAUT = 16
  const pas = L / donnees.length
  const y = (v: number) => H - (v / max) * (H - HAUT)
  return (
    <svg className="barres" viewBox={`0 0 ${L} ${H + 20}`} role="img" aria-label={donnees.map((d) => `${d.etiquette} : ${d.valeur} ${unite}`).join(', ')}>
      <line x1={0} x2={L} y1={H} y2={H} className="barre-axe" />
      {donnees.map((d, i) => {
        const x = i * pas + pas * 0.2
        const l = pas * 0.6
        return (
          <g key={i}>
            <rect x={x} y={y(d.valeur)} width={l} height={H - y(d.valeur)} rx={3} className={d.courante ? 'barre barre-courante' : 'barre'} />
            {d.repere != null && d.repere > 0 && <line x1={x - 4} x2={x + l + 4} y1={y(d.repere)} y2={y(d.repere)} className="barre-repere" />}
            {d.valeur > 0 && (
              <text x={x + l / 2} y={y(d.valeur) - 4} className="barre-valeur">
                {Math.round(d.valeur)}
              </text>
            )}
            <text x={x + l / 2} y={H + 14} className="barre-etiquette">
              {d.etiquette}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
