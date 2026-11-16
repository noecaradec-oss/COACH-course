// Génère les icônes PNG de l'appli à partir de public/favicon.svg.
// Outil ponctuel, hors de l'appli : il suppose Playwright installé sur la machine.
// À relancer seulement si le logo change : node scripts/icones.cjs
const { readFileSync } = require('node:fs')
const { chromium } = require('playwright')

async function generer() {
  const svg = readFileSync('public/favicon.svg', 'utf8')
  const navigateur = await chromium.launch()
  for (const taille of [180, 192, 512]) {
    const page = await navigateur.newPage({ viewport: { width: taille, height: taille } })
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:${taille}px;height:${taille}px}</style>${svg}`,
    )
    await page.screenshot({ path: `public/icone-${taille}.png` })
    await page.close()
  }
  await navigateur.close()
}
generer()
