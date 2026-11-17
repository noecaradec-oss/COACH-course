import { Encoder, type FileIdMesg, type LapMesg, Profile, type RecordMesg, type SessionMesg } from '@garmin/fitsdk'
import { describe, expect, it } from 'vitest'
import { ErreurFit, decoderFit, denivelesDepuisPoints, resumerFit } from './lireFit'

const DEBUT = new Date(2026, 10, 14, 9, 0, 0) // 14 nov. 2026, 9 h, heure locale

/**
 * Fabrique un vrai fichier .fit avec l'encodeur du SDK : 20 min, 4 km,
 * 2 km de montée à 5 % puis 2 km de descente, FC 150 puis 170.
 */
function fabriquerFit(): ArrayBuffer {
  const e = new Encoder()
  const entete: FileIdMesg = { type: 'activity', manufacturer: 'development', product: 1, timeCreated: DEBUT }
  e.onMesg(Profile.MesgNum.FILE_ID, entete)
  for (let s = 0; s <= 1200; s += 5) {
    const distance = (s / 1200) * 4000
    const point: RecordMesg = {
      timestamp: new Date(DEBUT.getTime() + s * 1000),
      distance,
      enhancedAltitude: distance <= 2000 ? 100 + distance * 0.05 : 200 - (distance - 2000) * 0.05,
      heartRate: s <= 600 ? 150 : 170,
    }
    e.onMesg(Profile.MesgNum.RECORD, point)
  }
  for (const [i, fc] of [150, 170].entries()) {
    const tour: LapMesg = {
      timestamp: new Date(DEBUT.getTime() + (i + 1) * 600_000),
      startTime: new Date(DEBUT.getTime() + i * 600_000),
      totalElapsedTime: 600,
      totalTimerTime: 600,
      totalDistance: 2000,
      avgHeartRate: fc,
    }
    e.onMesg(Profile.MesgNum.LAP, tour)
  }
  const session: SessionMesg = {
    timestamp: new Date(DEBUT.getTime() + 1_200_000),
    startTime: DEBUT,
    sport: 'running',
    totalElapsedTime: 1230,
    totalTimerTime: 1200,
    totalDistance: 4000,
    avgHeartRate: 160,
    maxHeartRate: 172,
    totalAscent: 100,
    totalDescent: 100,
  }
  e.onMesg(Profile.MesgNum.SESSION, session)
  const octets = e.close()
  return octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer
}

describe('lecture d’un fichier .fit (SDK Garmin)', () => {
  const messages = decoderFit(fabriquerFit())

  it('résume la séance', () => {
    const r = resumerFit(messages)
    expect(r.date).toBe('2026-11-14')
    expect(r.source).toBe('fit')
    expect(r.distanceM).toBe(4000)
    expect(r.dureeS).toBe(1200) // temps en mouvement, pas le temps écoulé
    expect(r.fcMoy).toBe(160)
    expect(r.fcMax).toBe(172)
    expect(r.denivelePosM).toBe(100)
    expect(r.deniveleNegM).toBe(100)
  })

  it('garde les tours', () => {
    expect(resumerFit(messages).tours).toEqual([
      { distanceM: 2000, dureeS: 600, fcMoy: 150 },
      { distanceM: 2000, dureeS: 600, fcMoy: 170 },
    ])
  })

  it('n’invente ni zones ni TRIMP sans FC max', () => {
    const r = resumerFit(messages)
    expect(r.tempsZonesS).toBeUndefined()
    expect(r.trimp).toBeUndefined()
  })

  it('répartit le temps par zone avec la FC max', () => {
    // FC max 200 : 150 → zone 2 (75–85 %), 170 → zone 3 (85–90 %). 10 min chacune.
    const r = resumerFit(messages, { fcMax: 200 })
    expect(r.tempsZonesS).toEqual([0, 600, 600, 0, 0])
    expect(r.trimp).toBeUndefined() // il manque la FC de repos et le sexe
  })

  it('calcule le TRIMP point par point', () => {
    // Homme, repos 50, max 200.
    // 10 min à 150 : x = 0,667 → 10 × 0,667 × 0,64 × e^1,28 = 15,35
    // 10 min à 170 : x = 0,8   → 10 × 0,8   × 0,64 × e^1,536 = 23,79
    const r = resumerFit(messages, { fcMax: 200, fcRepos: 50, sexe: 'homme' })
    expect(r.trimp).toBe(39)
  })

  it('calcule la distance équivalente à plat', () => {
    // 2000 m à +5 % et 2000 m à −5 % :
    // C(+0,05) = 4,6851 ; C(−0,05) = 2,7461 ; à plat 3,6
    // 2000 × (4,6851 + 2,7461) / 3,6 = 4128 m
    const r = resumerFit(messages)
    expect(Math.abs(r.distanceEquivPlatM! - 4128)).toBeLessThan(15)
  })

  it('ignore les pauses dans le temps par zone', () => {
    const t0 = DEBUT.getTime()
    const avecPause = {
      recordMesgs: [
        { timestamp: new Date(t0), heartRate: 150 },
        { timestamp: new Date(t0 + 5000), heartRate: 150 },
        { timestamp: new Date(t0 + 305_000), heartRate: 150 }, // 5 min de pause
        { timestamp: new Date(t0 + 310_000), heartRate: 150 },
      ],
    }
    expect(resumerFit(avecPause, { fcMax: 200 }).tempsZonesS).toEqual([0, 10, 0, 0, 0])
  })

  it('se débrouille sans message de session', () => {
    const t0 = DEBUT.getTime()
    const r = resumerFit({
      recordMesgs: [
        { timestamp: new Date(t0), distance: 0, heartRate: 140 },
        { timestamp: new Date(t0 + 600_000), distance: 2000, heartRate: 160 },
      ],
    })
    expect(r.distanceM).toBe(2000)
    expect(r.dureeS).toBe(600)
    expect(r.fcMoy).toBe(150)
    expect(r.fcMax).toBe(160)
  })

  it('refuse un fichier qui n’est pas un .fit, ou abîmé, ou vide', () => {
    expect(() => decoderFit(new TextEncoder().encode('ceci est un GPX, pas un FIT').buffer as ArrayBuffer)).toThrow(ErreurFit)
    const abime = new Uint8Array(fabriquerFit())
    abime[abime.length - 20] ^= 0xff
    expect(() => decoderFit(abime.buffer as ArrayBuffer)).toThrow(ErreurFit)
    expect(() => resumerFit({})).toThrow(ErreurFit)
  })

  it('recalcule distance et FC des tours quand le fichier ne les donne pas (exports Strava)', () => {
    const t0 = DEBUT.getTime()
    const r = resumerFit({
      sessionMesgs: [{ startTime: DEBUT, totalDistance: 2000, totalTimerTime: 600, totalElapsedTime: 600 }],
      recordMesgs: Array.from({ length: 601 }, (_, s) => ({ timestamp: new Date(t0 + s * 1000), distance: (s / 600) * 2000, heartRate: s < 300 ? 140 : 160 })),
      lapMesgs: [
        { startTime: DEBUT, timestamp: new Date(t0 + 300_000), totalTimerTime: 300 },
        { startTime: new Date(t0 + 300_000), timestamp: new Date(t0 + 600_000), totalTimerTime: 300 },
        // Dernier tour parasite de 0,3 s ajouté par Strava.
        { startTime: new Date(t0 + 600_000), timestamp: new Date(t0 + 600_300), totalTimerTime: 0.3 },
      ],
    })
    expect(r.tours).toHaveLength(2)
    expect(r.tours[0]).toEqual({ distanceM: 1000, dureeS: 300, fcMoy: 140 })
    // Le point de bascule (s = 300) appartient aux deux tours : 1 point à 140 sur 301.
    expect(r.tours[1].distanceM).toBe(1000)
    expect(r.tours[1].fcMoy).toBe(160)
  })

  it('recalcule le dénivelé depuis les points quand la session ne le donne pas', () => {
    // Montée de 0 à 20 m, descente à 5 m. Le bruit de ±1 m ne compte pas, ni le sommet à 21 m (sous le seuil de 3 m).
    const profil = [0, 1, 0, 1, 5, 10, 9, 10, 15, 20, 21, 20, 15, 10, 11, 10, 5]
    expect(denivelesDepuisPoints(profil.map((altitudeM) => ({ altitudeM })))).toEqual({ plus: 20, moins: 15 })
    expect(denivelesDepuisPoints([{ altitudeM: 10 }])).toBeNull()
    expect(denivelesDepuisPoints([{}, {}])).toBeNull()
    const t0 = DEBUT.getTime()
    const r = resumerFit({
      sessionMesgs: [{ startTime: DEBUT, totalDistance: 1700, totalTimerTime: 600 }],
      recordMesgs: profil.map((altitudeM, i) => ({ timestamp: new Date(t0 + i * 1000), distance: i * 100, enhancedAltitude: altitudeM })),
    })
    expect(r.denivelePosM).toBe(20)
    expect(r.deniveleNegM).toBe(15)
  })

  it('reconstitue la distance par la vitesse quand les points n’en ont pas', () => {
    const t0 = DEBUT.getTime()
    // 3 m/s pendant 200 s, puis une pause de 60 s (non comptée), puis 100 s.
    const temps = [...Array.from({ length: 201 }, (_, s) => s), ...Array.from({ length: 101 }, (_, s) => 260 + s)]
    const r = resumerFit({
      sessionMesgs: [{ startTime: DEBUT, totalDistance: 900, totalTimerTime: 300 }],
      recordMesgs: temps.map((s, i) => ({ timestamp: new Date(t0 + s * 1000), speed: 3, ...(i === 0 ? { distance: 0 } : {}) })),
      lapMesgs: [
        { startTime: DEBUT, timestamp: new Date(t0 + 200_000), totalTimerTime: 200 },
        { startTime: new Date(t0 + 260_000), timestamp: new Date(t0 + 360_000), totalTimerTime: 100 },
      ],
    })
    expect(r.tours.map((t) => t.distanceM)).toEqual([600, 300])
  })
})
