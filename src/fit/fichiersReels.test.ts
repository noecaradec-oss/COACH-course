/// <reference types="node" />
// Vérification sur de vrais fichiers .fit, hors dépôt : ce sont des données
// personnelles (positions GPS comprises). Le test ne tourne que si on lui
// donne un dossier :
//
//   FIT_REELS=/chemin/vers/dossier npx vitest run src/fit/fichiersReels.test.ts
//
// Il vérifie des propriétés générales, valables pour tout fichier de course.

import { readFileSync, readdirSync } from 'node:fs'
import { Decoder, Stream } from '@garmin/fitsdk'
import { describe, expect, it } from 'vitest'
import { decoderFit, resumerFit } from './lireFit'

const DOSSIER = process.env.FIT_REELS
const fichiers = DOSSIER ? readdirSync(DOSSIER).filter((n) => n.toLowerCase().endsWith('.fit')).sort() : []

function lire(nom: string): ArrayBuffer {
  const o = readFileSync(`${DOSSIER}/${nom}`)
  return o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer
}

describe.skipIf(!DOSSIER)('fichiers .fit réels', () => {
  it('le dossier contient des fichiers', () => {
    expect(fichiers.length).toBeGreaterThan(0)
  })

  for (const nom of fichiers) {
    it(nom, () => {
      const octets = lire(nom)
      const brut = new Decoder(Stream.fromArrayBuffer(octets)).read().messages
      const session = brut.sessionMesgs?.[0]
      const r = resumerFit(decoderFit(octets), { fcMax: 195, fcRepos: 50, sexe: 'homme' })

      // Distance et durée : celles du fichier, et une allure de course à pied plausible.
      if (session?.totalDistance) expect(r.distanceM).toBe(Math.round(session.totalDistance))
      expect(r.dureeS).toBeGreaterThan(0)
      const allure = r.dureeS / (r.distanceM / 1000)
      expect(allure).toBeGreaterThan(150) // plus lent que 2:30/km
      expect(allure).toBeLessThan(1200) // plus rapide que 20:00/km

      // Tours : pas de tour parasite, et leur total retombe sur la séance à 3 % près.
      for (const t of r.tours) expect(t.dureeS).toBeGreaterThanOrEqual(3)
      if (r.tours.length > 0) {
        const duree = r.tours.reduce((s, t) => s + t.dureeS, 0)
        const distance = r.tours.reduce((s, t) => s + t.distanceM, 0)
        expect(Math.abs(duree - r.dureeS)).toBeLessThanOrEqual(r.tours.length + 2)
        expect(Math.abs(distance - r.distanceM) / r.distanceM).toBeLessThan(0.03)
        for (const t of r.tours) if (t.dureeS >= 60) expect(t.distanceM, 'tour d’une minute ou plus sans distance').toBeGreaterThan(0)
      }

      // Fréquence cardiaque : présente si les points en portent, plausible, et jamais plus de temps en zones que de chrono.
      const avecFc = (brut.recordMesgs ?? []).some((p) => p.heartRate !== undefined)
      expect(r.fcMoy !== undefined).toBe(avecFc)
      if (r.fcMoy !== undefined) {
        expect(r.fcMoy).toBeGreaterThan(60)
        expect(r.fcMoy).toBeLessThanOrEqual(r.fcMax!)
        expect(r.fcMax!).toBeLessThan(230)
        const zones = r.tempsZonesS!.reduce((s, z) => s + z, 0)
        expect(zones).toBeLessThanOrEqual(r.dureeS + 1)
        expect(r.trimp!).toBeGreaterThan(0)
      }

      // Dénivelé : présent dès que les points portent une altitude.
      const avecAltitude = (brut.recordMesgs ?? []).some((p) => (p.enhancedAltitude ?? p.altitude) !== undefined)
      if (avecAltitude) {
        expect(r.denivelePosM).toBeDefined()
        expect(r.deniveleNegM).toBeDefined()
        expect(r.distanceEquivPlatM).toBeDefined()
      }
    })
  }
})
