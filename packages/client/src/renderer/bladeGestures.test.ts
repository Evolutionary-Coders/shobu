import { describe, expect, it } from 'vitest'
import {
  SNIPER_TRACKS,
  type SniperTrack,
  sampleTrack,
  sniperTrackDurationS,
} from './bladeGestures.ts'
import { createRigPose, REST_POSE } from './rigPose.ts'

const TRACKS = Object.keys(SNIPER_TRACKS) as SniperTrack[]

describe('SNIPER_TRACKS', () => {
  it.each(TRACKS)('%s: as chaves andam para a frente no tempo e terminam no descanso', (track) => {
    const times = SNIPER_TRACKS[track].map((key) => key.atS)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(new Set(times).size).toBe(times.length)
    expect(sampleTrack(SNIPER_TRACKS[track], 99, createRigPose())).toEqual(REST_POSE)
  })

  it('no golpe rápido a sniper sai da tela num estalo, antes de a lâmina chegar à retícula', () => {
    expect(sampleTrack(SNIPER_TRACKS.dip, 0.07, createRigPose()).y).toBeLessThan(-0.4)
    expect(sniperTrackDurationS('dip')).toBeCloseTo(0.56)
  })
})

describe('sampleTrack', () => {
  const keys = SNIPER_TRACKS.raise

  it('antes da primeira chave vale a primeira', () => {
    expect(sampleTrack(keys, -1, createRigPose()).y).toBeLessThan(0)
  })

  it('no meio, mistura suave entre as duas chaves', () => {
    const middle = sampleTrack(keys, (0.18 + 0.34) / 2, createRigPose())
    expect(middle.y).toBeCloseTo(-0.5 / 2)
  })

  it('trilha vazia é o descanso', () => {
    expect(sampleTrack([], 0.1, createRigPose())).toEqual(REST_POSE)
  })
})
