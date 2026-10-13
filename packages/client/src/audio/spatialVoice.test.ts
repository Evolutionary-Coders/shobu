import { describe, expect, it } from 'vitest'
import { toWebAudioSpace, voicePannerOptions } from './spatialVoice.ts'

describe('voicePannerOptions', () => {
  it('cheio até o raio cheio, silêncio no raio de silêncio, com direção', () => {
    expect(voicePannerOptions({ fullVolumeRadiusM: 10, silentRadiusM: 45 })).toEqual({
      panningModel: 'HRTF',
      distanceModel: 'linear',
      refDistance: 10,
      maxDistance: 45,
      rolloffFactor: 1,
    })
  })
})

describe('toWebAudioSpace', () => {
  it('a frente do babylon (+z) vira a frente do Web Audio (-z)', () => {
    expect(toWebAudioSpace({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 0 })).toEqual({
      x: 1,
      y: 2,
      z: -3,
    })
  })

  it('escreve no objeto recebido, sem alocar por quadro', () => {
    const out = { x: 0, y: 0, z: 0 }
    expect(toWebAudioSpace({ x: 0, y: 0, z: 1 }, out)).toBe(out)
  })
})
