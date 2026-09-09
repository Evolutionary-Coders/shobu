import { describe, expect, it } from 'vitest'
import {
  ALLANIMS_DURATION_S,
  GLTF_FRAMES_PER_SECOND,
  segmentFrames,
  VIEWMODEL_SEGMENTS,
  type ViewmodelClip,
} from './viewmodelClips.ts'

const CLIPS = Object.keys(VIEWMODEL_SEGMENTS) as ViewmodelClip[]

describe('VIEWMODEL_SEGMENTS', () => {
  it('todo intervalo cabe dentro do clipe allanims', () => {
    for (const clip of CLIPS) {
      const { fromS, toS } = VIEWMODEL_SEGMENTS[clip]
      expect(fromS, clip).toBeGreaterThanOrEqual(0)
      expect(toS, clip).toBeLessThanOrEqual(ALLANIMS_DURATION_S)
      expect(toS, clip).toBeGreaterThan(fromS)
    }
  })

  /** Dois intervalos sobrepostos tocariam metade de um gesto dentro do outro. */
  it('os intervalos não se sobrepõem', () => {
    const sorted = CLIPS.map((clip) => VIEWMODEL_SEGMENTS[clip]).sort((a, b) => a.fromS - b.fromS)
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      const current = sorted[index]
      if (!previous || !current) throw new Error(`segmento ${index} ausente`)
      expect(current.fromS).toBeGreaterThanOrEqual(previous.toS)
    }
  })

  /** 0,7 s de dedo em loop cheio era um tique; devagar vira respiração. */
  it('o idle roda devagar e os gestos no ritmo autorado', () => {
    expect(VIEWMODEL_SEGMENTS.idle.speedRatio).toBeLessThanOrEqual(0.5)
    expect(VIEWMODEL_SEGMENTS.shoot.speedRatio).toBe(1)
    expect(VIEWMODEL_SEGMENTS.bolt.speedRatio).toBe(1)
    expect(VIEWMODEL_SEGMENTS.reload.speedRatio).toBe(1)
  })

  it('só o idle repete: disparo, ferrolho e recarga acontecem uma vez', () => {
    expect(VIEWMODEL_SEGMENTS.idle.loop).toBe(true)
    expect(VIEWMODEL_SEGMENTS.shoot.loop).toBe(false)
    expect(VIEWMODEL_SEGMENTS.bolt.loop).toBe(false)
    expect(VIEWMODEL_SEGMENTS.reload.loop).toBe(false)
  })
})

describe('segmentFrames', () => {
  it('converte segundos em quadros do glTF', () => {
    expect(segmentFrames('idle')).toEqual({
      from: 4.7 * GLTF_FRAMES_PER_SECOND,
      to: 5.4 * GLTF_FRAMES_PER_SECOND,
    })
  })
})
