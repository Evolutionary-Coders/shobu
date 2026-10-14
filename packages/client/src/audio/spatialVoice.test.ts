import { describe, expect, it } from 'vitest'
import { voicePannerOptions } from './spatialVoice.ts'

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
