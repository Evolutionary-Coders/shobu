import { describe, expect, it } from 'vitest'
import { audibleGain, distanceBetweenM, SOUND_FALLOFF } from './soundFalloff.ts'

const SHOT = SOUND_FALLOFF['shot-sniper']
const STEPS = SOUND_FALLOFF.running

describe('audibleGain', () => {
  it('perto, volume cheio', () => {
    expect(audibleGain(0, SHOT)).toBe(1)
    expect(audibleGain(SHOT.fullWithinM, SHOT)).toBe(1)
  })

  it('cai com o inverso da distância', () => {
    expect(audibleGain(SHOT.fullWithinM * 2, SHOT)).toBeCloseTo(0.5)
    expect(audibleGain(60, SHOT)).toBeCloseTo(0.2)
  })

  it('a borda leva a zero sem degrau, e além dela é silêncio', () => {
    const edge = SHOT.silentBeyondM * 0.75
    expect(audibleGain(edge, SHOT)).toBeCloseTo(SHOT.fullWithinM / edge)
    expect(audibleGain(SHOT.silentBeyondM - 0.01, SHOT)).toBeLessThan(0.001)
    expect(audibleGain(SHOT.silentBeyondM, SHOT)).toBe(0)
    expect(audibleGain(SHOT.silentBeyondM * 3, SHOT)).toBe(0)
  })

  /** O tiro denuncia a posição: atravessa o mapa. A passada só entrega quem está perto. */
  it('o tiro se ouve do outro lado do mapa, a passada não passa de ~22 m', () => {
    expect(audibleGain(110, SHOT)).toBeGreaterThan(0.05)
    expect(audibleGain(15, STEPS)).toBeGreaterThan(0.1)
    expect(audibleGain(23, STEPS)).toBe(0)
  })

  it('o tiro de longe soa mais que a passada à mesma distância', () => {
    expect(audibleGain(18, SHOT)).toBeGreaterThan(audibleGain(18, STEPS))
  })
})

describe('distanceBetweenM', () => {
  it('é a distância euclidiana', () => {
    expect(distanceBetweenM({ x: 1, y: 2, z: 3 }, { x: 4, y: 6, z: 3 })).toBe(5)
  })
})
