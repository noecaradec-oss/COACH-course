// Dates au format "AAAA-MM-JJ", manipulées en UTC pour éviter les
// décalages d'une heure aux changements d'heure.

export type DateIso = string

const JOUR_MS = 86_400_000

function versUtc(date: DateIso): number {
  const [a, m, j] = date.split('-').map(Number)
  return Date.UTC(a, m - 1, j)
}

function depuisUtc(ms: number): DateIso {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Date locale du jour (celle que lit le coureur sur son téléphone). */
export function aujourdHui(maintenant: Date = new Date()): DateIso {
  const a = maintenant.getFullYear()
  const m = String(maintenant.getMonth() + 1).padStart(2, '0')
  const j = String(maintenant.getDate()).padStart(2, '0')
  return `${a}-${m}-${j}`
}

export function ajouterJours(date: DateIso, jours: number): DateIso {
  return depuisUtc(versUtc(date) + jours * JOUR_MS)
}

export function joursEntre(debut: DateIso, fin: DateIso): number {
  return Math.round((versUtc(fin) - versUtc(debut)) / JOUR_MS)
}

/** 0 = lundi … 6 = dimanche. */
export function jourSemaine(date: DateIso): number {
  return (new Date(versUtc(date)).getUTCDay() + 6) % 7
}

export function lundiDe(date: DateIso): DateIso {
  return ajouterJours(date, -jourSemaine(date))
}

export const NOMS_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const NOMS_MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** "2026-11-16" → "lundi 16 nov." */
export function formaterDate(date: DateIso, avecJour = true): string {
  const [, m, j] = date.split('-').map(Number)
  const base = `${j} ${NOMS_MOIS[m - 1]}`
  return avecJour ? `${NOMS_JOURS[jourSemaine(date)]} ${base}` : base
}
