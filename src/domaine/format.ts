// Mise en forme et lecture des durées, allures et distances.

/** 3725 → "1:02:05" ; 245 → "4:05". */
export function formaterDuree(secondes: number): string {
  const total = Math.round(secondes)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Allure en secondes par km → "4:15/km". */
export function formaterAllure(secondesParKm: number): string {
  return `${formaterDuree(secondesParKm)}/km`
}

/**
 * "1:02:05", "4:05", "1h31" ou "45" (minutes seules) → secondes.
 * Renvoie null si illisible.
 */
export function lireDuree(texte: string): number | null {
  const propre = texte.trim().toLowerCase()
  const avecHeures = propre.includes('h')
  const parties = propre
    .replace(/[h'’]/g, ':')
    .replace(/["”s]/g, '')
    .split(':')
    .filter((p) => p !== '')
  if (parties.length === 0 || parties.length > 3) return null
  const nombres = parties.map(Number)
  if (nombres.some((n) => !Number.isFinite(n) || n < 0)) return null
  // "1h31" : heures puis minutes, alors que "1:31" se lit minutes puis secondes.
  if (avecHeures) return nombres[0] * 3600 + (nombres[1] ?? 0) * 60 + (nombres[2] ?? 0)
  if (nombres.length === 1) return nombres[0] * 60
  if (nombres.length === 2) return nombres[0] * 60 + nombres[1]
  return nombres[0] * 3600 + nombres[1] * 60 + nombres[2]
}

/** 12345 m → "12,3 km" ; 800 m → "800 m". */
export function formaterDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`
  return `${(metres / 1000).toFixed(metres < 10000 ? 2 : 1).replace('.', ',')} km`
}

export function allureDepuisVitesse(metresParMinute: number): number {
  return 60000 / metresParMinute
}
