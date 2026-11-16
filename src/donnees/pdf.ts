// Écriture d'un fichier PDF simple, sans bibliothèque : du texte, des
// tableaux et des filets, sur des pages A4. Suffisant pour un bilan à
// envoyer à un entraîneur ; pas de graphiques ni d'images.
//
// Référence du format : ISO 32000-1 (PDF 1.7). On n'utilise que les polices
// standard Helvetica, que tout lecteur PDF fournit, avec l'encodage
// WinAnsi pour les lettres accentuées du français.

const LARGEUR = 595 // A4 en points (1 point = 1/72 de pouce)
const HAUTEUR = 842
const MARGE = 48

// Caractères hors Latin-1 présents dans WinAnsi (Windows-1252).
const WIN_ANSI: Record<string, number> = { '€': 0x80, '…': 0x85, Œ: 0x8c, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, œ: 0x9c }
// Caractères remplacés par un équivalent simple.
const EQUIVALENTS: Record<string, string> = { '−': '-', ' ': ' ', ' ': ' ', ' ': ' ', '≤': '<=', '≥': '>=', '→': '->' }

/** Octets WinAnsi d'un texte ; un caractère inconnu devient « ? ». */
export function encoderWinAnsi(texte: string): number[] {
  const octets: number[] = []
  for (const brut of texte) {
    for (const c of EQUIVALENTS[brut] ?? brut) {
      const code = c.codePointAt(0)!
      if (WIN_ANSI[c] !== undefined) octets.push(WIN_ANSI[c])
      else if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) octets.push(code)
      else octets.push(0x3f)
    }
  }
  return octets
}

/** Chaîne PDF entre parenthèses, avec échappement en octal de tout ce qui n'est pas de l'ASCII simple. */
function chaine(texte: string): string {
  let s = '('
  for (const o of encoderWinAnsi(texte)) {
    if (o === 0x28 || o === 0x29 || o === 0x5c) s += `\\${String.fromCharCode(o)}`
    else if (o < 0x20 || o > 0x7e) s += `\\${o.toString(8).padStart(3, '0')}`
    else s += String.fromCharCode(o)
  }
  return `${s})`
}

// Largeur moyenne d'un caractère Helvetica, en fraction de la taille de
// police. Approximation suffisante pour couper un texte trop long : les
// largeurs exactes demanderaient d'embarquer la table des métriques.
const LARGEUR_CARACTERE = 0.5

export interface Colonne {
  titre: string
  /** Largeur en points. */
  largeur: number
}

export class DocumentPdf {
  private pages: string[] = []
  private contenu = ''
  private y = HAUTEUR - MARGE
  private readonly piedDePage: string

  constructor(piedDePage: string) {
    this.piedDePage = piedDePage
  }

  private place(hauteur: number) {
    if (this.y - hauteur < MARGE + 20) this.nouvellePage()
  }

  nouvellePage() {
    this.pages.push(this.contenu)
    this.contenu = ''
    this.y = HAUTEUR - MARGE
  }

  private ecrire(texte: string, x: number, taille: number, gras: boolean) {
    this.contenu += `BT /${gras ? 'F2' : 'F1'} ${taille} Tf ${x} ${this.y} Td ${chaine(texte)} Tj ET\n`
  }

  /** Coupe un texte en lignes qui tiennent dans une largeur donnée. */
  private couper(texte: string, largeur: number, taille: number): string[] {
    const max = Math.max(8, Math.floor(largeur / (taille * LARGEUR_CARACTERE)))
    const lignes: string[] = []
    let ligne = ''
    for (const mot of texte.split(/\s+/)) {
      if (ligne !== '' && ligne.length + 1 + mot.length > max) {
        lignes.push(ligne)
        ligne = mot
      } else ligne = ligne === '' ? mot : `${ligne} ${mot}`
    }
    if (ligne !== '') lignes.push(ligne)
    return lignes
  }

  titre(texte: string) {
    this.place(34)
    this.ecrire(texte, MARGE, 20, true)
    this.y -= 30
  }

  sousTitre(texte: string) {
    this.place(40)
    this.y -= 8
    this.ecrire(texte, MARGE, 13, true)
    this.y -= 6
    this.contenu += `0.6 w ${MARGE} ${this.y} m ${LARGEUR - MARGE} ${this.y} l S\n`
    this.y -= 16
  }

  paragraphe(texte: string, taille = 10) {
    for (const ligne of this.couper(texte, LARGEUR - 2 * MARGE, taille)) {
      this.place(taille + 4)
      this.ecrire(ligne, MARGE, taille, false)
      this.y -= taille + 4
    }
    this.y -= 4
  }

  /** Tableau : en-têtes en gras, une ligne de texte par rangée, texte tronqué à la largeur de la colonne. */
  tableau(colonnes: Colonne[], rangees: string[][]) {
    const taille = 8.5
    const hauteur = 14
    const ligne = (cellules: string[], gras: boolean) => {
      let x = MARGE
      cellules.forEach((c, i) => {
        const max = Math.floor((colonnes[i].largeur - 6) / (taille * LARGEUR_CARACTERE))
        this.ecrire(c.length > max ? `${c.slice(0, Math.max(1, max - 1))}…` : c, x, taille, gras)
        x += colonnes[i].largeur
      })
      this.y -= hauteur
    }
    const entete = () => {
      ligne(colonnes.map((c) => c.titre), true)
      this.contenu += `0.3 w ${MARGE} ${this.y + hauteur - 4} m ${LARGEUR - MARGE} ${this.y + hauteur - 4} l S\n`
    }
    this.place(hauteur * 3)
    entete()
    for (const rangee of rangees) {
      if (this.y - hauteur < MARGE + 20) {
        this.nouvellePage()
        entete()
      }
      ligne(rangee, false)
    }
    this.y -= 8
  }

  /** Assemble le fichier : objets, table des références, fin de fichier. */
  terminer(): Uint8Array<ArrayBuffer> {
    const pages = [...this.pages, this.contenu]
    const objets: string[] = []
    // 1 : catalogue, 2 : liste des pages, 3 et 4 : polices, puis 2 objets par page.
    const idPage = (i: number) => 5 + 2 * i
    objets[0] = '<< /Type /Catalog /Pages 2 0 R >>'
    objets[1] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${idPage(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`
    objets[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    objets[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    pages.forEach((contenu, i) => {
      const pied = `BT /F1 8 Tf ${MARGE} ${MARGE - 14} Td ${chaine(`${this.piedDePage} · page ${i + 1} / ${pages.length}`)} Tj ET\n`
      const flux = contenu + pied
      objets[idPage(i) - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGEUR} ${HAUTEUR}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idPage(i) + 1} 0 R >>`
      // Le flux ne contient que de l'ASCII (les accents sont échappés) : sa longueur en caractères est sa longueur en octets.
      objets[idPage(i)] = `<< /Length ${flux.length} >>\nstream\n${flux}endstream`
    })

    let fichier = '%PDF-1.4\n'
    const positions: number[] = []
    objets.forEach((objet, i) => {
      positions.push(fichier.length)
      fichier += `${i + 1} 0 obj\n${objet}\nendobj\n`
    })
    const debutTable = fichier.length
    fichier += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`
    for (const p of positions) fichier += `${String(p).padStart(10, '0')} 00000 n \n`
    fichier += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${debutTable}\n%%EOF\n`
    const octets = new Uint8Array(fichier.length)
    for (let i = 0; i < fichier.length; i++) octets[i] = fichier.charCodeAt(i)
    return octets
  }
}
