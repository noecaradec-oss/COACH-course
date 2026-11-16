// Graphiques du tableau de bord, en SVG, sans bibliothèque.
//
// Règles suivies : une seule échelle par graphique, des marques fines,
// une grille discrète, peu d'étiquettes (la valeur touchée s'affiche sous
// le graphique), une légende dès qu'il y a deux séries, et un tableau de
// chiffres accessible sous chaque graphique. Le texte garde la couleur du
// texte : seule la marque porte la couleur de la série.

import { type ReactNode, useState } from 'react'

const L = 340
const H = 170
const GAUCHE = 30
const DROITE = 8
const HAUT = 16
const BAS = 22
const ZONE_L = L - GAUCHE - DROITE
const ZONE_H = H - HAUT - BAS

/** Graduations « rondes » de 0 à un maximum arrondi au-dessus de la valeur la plus haute. */
export function graduations(max: number, nbMax = 4): number[] {
  if (!(max > 0)) return [0, 1]
  const brut = max / nbMax
  const puissance = 10 ** Math.floor(Math.log10(brut))
  const pas = [1, 2, 5, 10].map((m) => m * puissance).find((p) => p >= brut)!
  const ticks: number[] = []
  for (let v = 0; v < max + pas - 1e-9; v += pas) ticks.push(Math.round(v * 1000) / 1000)
  return ticks
}

function Grille({ ticks, y, format }: { ticks: number[]; y: (v: number) => number; format: (v: number) => string }) {
  return (
    <g aria-hidden="true">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={GAUCHE} x2={L - DROITE} y1={y(t)} y2={y(t)} className={t === 0 ? 'g-axe' : 'g-grille'} />
          <text x={GAUCHE - 5} y={y(t) + 3.5} className="g-tick g-tick-y">
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  )
}

function Chiffres({ entetes, rangees }: { entetes: string[]; rangees: (string | number)[][] }) {
  return (
    <details className="g-chiffres">
      <summary>Voir les chiffres</summary>
      <table>
        <thead>
          <tr>
            {entetes.map((e) => (
              <th key={e} scope="col">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rangees.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

export function Legende({ entrees }: { entrees: { nom: string; marque: ReactNode }[] }) {
  return (
    <p className="g-legende">
      {entrees.map((e) => (
        <span key={e.nom}>
          {e.marque}
          {e.nom}
        </span>
      ))}
    </p>
  )
}

export interface Colonne {
  etiquette: string
  valeur: number
  /** Valeur prévue, tracée comme un trait au-dessus ou dans la colonne. */
  repere?: number | null
  /** Phrase affichée quand la colonne est touchée. */
  detail: string
}

/** Colonnes verticales à une série, avec un repère « prévu » optionnel. */
export function Colonnes({ donnees, unite, titre, maximum, entetes }: { donnees: Colonne[]; unite: string; titre: string; maximum?: number; entetes: string[] }) {
  const [choisi, setChoisi] = useState(donnees.length - 1)
  const aRepere = donnees.some((d) => d.repere != null)
  const ticks = graduations(maximum ?? Math.max(1, ...donnees.map((d) => Math.max(d.valeur, d.repere ?? 0))))
  const max = ticks[ticks.length - 1]
  const y = (v: number) => HAUT + ZONE_H - (Math.min(v, max) / max) * ZONE_H
  const pas = ZONE_L / donnees.length
  const largeur = Math.min(24, pas * 0.62)
  return (
    <figure className="graphique">
      <svg viewBox={`0 0 ${L} ${H}`} role="group" aria-label={titre}>
        <Grille ticks={ticks} y={y} format={(v) => String(v)} />
        {donnees.map((d, i) => {
          const x = GAUCHE + i * pas + (pas - largeur) / 2
          const h = HAUT + ZONE_H - y(d.valeur)
          const r = Math.min(4, h)
          return (
            <g key={i} tabIndex={0} role="img" aria-label={d.detail} className="g-cible" onClick={() => setChoisi(i)} onMouseEnter={() => setChoisi(i)} onFocus={() => setChoisi(i)}>
              {/* Zone de toucher plus large que la marque. */}
              <rect x={GAUCHE + i * pas} y={HAUT} width={pas} height={ZONE_H + BAS} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${HAUT + ZONE_H} v${-(h - r)} q0,${-r} ${r},${-r} h${largeur - 2 * r} q${r},0 ${r},${r} v${h - r} z`}
                  className={i === choisi ? 'g-barre g-barre-choisie' : 'g-barre'}
                />
              )}
              {d.repere != null && d.repere > 0 && <line x1={x - 4} x2={x + largeur + 4} y1={y(d.repere)} y2={y(d.repere)} className="g-repere" />}
              {i === choisi && d.valeur > 0 && (
                <text x={x + largeur / 2} y={y(d.valeur) - 4} className="g-valeur">
                  {Math.round(d.valeur)}
                </text>
              )}
              <text x={x + largeur / 2} y={H - 6} className={i === choisi ? 'g-tick g-tick-choisi' : 'g-tick'}>
                {d.etiquette}
              </text>
            </g>
          )
        })}
      </svg>
      {aRepere && (
        <Legende
          entrees={[
            { nom: 'Réalisé', marque: <span className="g-cle g-cle-barre" /> },
            { nom: 'Prévu', marque: <span className="g-cle g-cle-trait" /> },
          ]}
        />
      )}
      <figcaption aria-live="polite">{donnees[choisi]?.detail}</figcaption>
      <Chiffres entetes={entetes} rangees={donnees.map((d) => [d.etiquette, ...(aRepere ? [d.repere == null ? '–' : Math.round(d.repere)] : []), `${Math.round(d.valeur * 10) / 10} ${unite}`.replace('.', ',')])} />
    </figure>
  )
}

export interface Part {
  cle: 'facile' | 'seuil' | 'intense'
  nom: string
  valeur: number
}

/** Barre segmentée : un tout découpé en parts, avec la part en pourcentage dans chaque segment assez large. */
export function BarreSegmentee({ parts, titre }: { parts: Part[]; titre: string }) {
  const total = parts.reduce((s, p) => s + p.valeur, 0)
  if (total === 0) return null
  const resume = parts.map((p) => `${p.valeur} ${p.nom.toLowerCase()} (${Math.round((p.valeur / total) * 100)} %)`).join(', ')
  return (
    <figure className="graphique">
      <div className="g-segments" role="img" aria-label={`${titre} : ${resume}`}>
        {parts
          .filter((p) => p.valeur > 0)
          .map((p) => {
            const part = p.valeur / total
            return (
              <span key={p.cle} className={`g-segment g-segment-${p.cle}`} style={{ flexGrow: p.valeur }} title={`${p.nom} : ${p.valeur}`}>
                {part >= 0.14 ? `${Math.round(part * 100)} %` : ''}
              </span>
            )
          })}
      </div>
      <Legende entrees={parts.map((p) => ({ nom: `${p.nom} : ${p.valeur}`, marque: <span className={`g-cle g-cle-barre g-segment-${p.cle}`} /> }))} />
    </figure>
  )
}

export interface Paire {
  etiquette: string
  prevu: number
  realise: number
  detail: string
}

/** Haltères : pour chaque séance, le ressenti prévu (anneau) et le ressenti réel (point plein), reliés. */
export function Halteres({ donnees, titre }: { donnees: Paire[]; titre: string }) {
  const [choisi, setChoisi] = useState(donnees.length - 1)
  const y = (v: number) => HAUT + ZONE_H - ((v - 0) / 10) * ZONE_H
  const pas = ZONE_L / donnees.length
  return (
    <figure className="graphique">
      <svg viewBox={`0 0 ${L} ${H}`} role="group" aria-label={titre}>
        <Grille ticks={[0, 2, 4, 6, 8, 10]} y={y} format={(v) => String(v)} />
        {donnees.map((d, i) => {
          const x = GAUCHE + i * pas + pas / 2
          return (
            <g key={i} tabIndex={0} role="img" aria-label={d.detail} className="g-cible" onClick={() => setChoisi(i)} onMouseEnter={() => setChoisi(i)} onFocus={() => setChoisi(i)}>
              <rect x={GAUCHE + i * pas} y={HAUT} width={pas} height={ZONE_H + BAS} fill="transparent" />
              {i === choisi && <line x1={x} x2={x} y1={HAUT} y2={HAUT + ZONE_H} className="g-grille" />}
              {d.prevu !== d.realise && <line x1={x} x2={x} y1={y(d.prevu)} y2={y(d.realise)} className="g-lien" />}
              <circle cx={x} cy={y(d.prevu)} r={5} className="g-anneau" />
              <circle cx={x} cy={y(d.realise)} r={5} className="g-point" />
              {(i === 0 || i === donnees.length - 1 || i === choisi) && (
                <text x={x} y={H - 6} className={i === choisi ? 'g-tick g-tick-choisi' : 'g-tick'}>
                  {d.etiquette}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <Legende
        entrees={[
          { nom: 'Ressenti réel', marque: <span className="g-cle g-cle-point" /> },
          { nom: 'Ressenti prévu', marque: <span className="g-cle g-cle-anneau" /> },
        ]}
      />
      <figcaption aria-live="polite">{donnees[choisi]?.detail}</figcaption>
      <Chiffres entetes={['Séance', 'Prévu', 'Réel']} rangees={donnees.map((d) => [d.etiquette, d.prevu, d.realise])} />
    </figure>
  )
}

export interface Point {
  etiquette: string
  valeur: number
  detail: string
}

/** Courbe à une série, pour une évolution dans le temps. L'échelle ne part pas de zéro : on lit une variation. */
export function Courbe({ donnees, titre, entetes }: { donnees: Point[]; titre: string; entetes: string[] }) {
  const [choisi, setChoisi] = useState(donnees.length - 1)
  const valeurs = donnees.map((d) => d.valeur)
  const bas = Math.floor(Math.min(...valeurs) - 1)
  const haut = Math.ceil(Math.max(...valeurs) + 1)
  const pasTick = Math.max(1, Math.ceil((haut - bas) / 4))
  const ticks: number[] = []
  for (let v = bas; v <= haut; v += pasTick) ticks.push(v)
  const sommet = ticks[ticks.length - 1]
  const y = (v: number) => HAUT + ZONE_H - ((v - bas) / (sommet - bas)) * ZONE_H
  const x = (i: number) => GAUCHE + 12 + (i * (ZONE_L - 24)) / Math.max(1, donnees.length - 1)
  return (
    <figure className="graphique">
      <svg viewBox={`0 0 ${L} ${H}`} role="group" aria-label={titre}>
        <g aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={GAUCHE} x2={L - DROITE} y1={y(t)} y2={y(t)} className="g-grille" />
              <text x={GAUCHE - 5} y={y(t) + 3.5} className="g-tick g-tick-y">
                {t}
              </text>
            </g>
          ))}
        </g>
        <polyline points={donnees.map((d, i) => `${x(i)},${y(d.valeur)}`).join(' ')} className="g-ligne" />
        {donnees.map((d, i) => (
          <g key={i} tabIndex={0} role="img" aria-label={d.detail} className="g-cible" onClick={() => setChoisi(i)} onMouseEnter={() => setChoisi(i)} onFocus={() => setChoisi(i)}>
            <rect x={x(i) - 16} y={HAUT} width={32} height={ZONE_H + BAS} fill="transparent" />
            <circle cx={x(i)} cy={y(d.valeur)} r={i === choisi ? 6 : 5} className="g-point" />
            {(i === donnees.length - 1 || i === choisi) && (
              <text x={x(i)} y={y(d.valeur) - 9} className="g-valeur">
                {String(d.valeur).replace('.', ',')}
              </text>
            )}
            {(i === 0 || i === donnees.length - 1 || i === choisi) && (
              <text x={x(i)} y={H - 6} className={i === choisi ? 'g-tick g-tick-choisi' : 'g-tick'}>
                {d.etiquette}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption aria-live="polite">{donnees[choisi]?.detail}</figcaption>
      <Chiffres entetes={entetes} rangees={donnees.map((d) => [d.etiquette, String(d.valeur).replace('.', ',')])} />
    </figure>
  )
}
