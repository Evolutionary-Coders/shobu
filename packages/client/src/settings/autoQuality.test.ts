import { describe, expect, it } from 'vitest'
import { createFrameStats, type FrameStats } from '../instrumentation/frameMeter.ts'
import {
  AUTO_SCALE_MIN,
  CEILING_SAMPLES,
  createAutoQuality,
  FAST_SAMPLES_TO_RISE,
  SLOW_SAMPLES_TO_DROP,
  stepAutoQuality,
} from './autoQuality.ts'

const REFRESH_MS = 1000 / 60
const SLOW: FrameStats = { ...createFrameStats(), frames: 120, p95Ms: 33.3 }
const FAST: FrameStats = { ...createFrameStats(), frames: 120, p95Ms: 16.7 }
const MIDDLE: FrameStats = { ...createFrameStats(), frames: 120, p95Ms: 19 }

function run(samples: readonly FrameStats[], state = createAutoQuality()) {
  for (const stats of samples) stepAutoQuality(state, stats, REFRESH_MS)
  return state
}

describe('stepAutoQuality', () => {
  it('começa na escala cheia', () => {
    expect(createAutoQuality().scale).toBe(1)
  })

  it('uma amostra lenta sozinha não derruba', () => {
    expect(run([SLOW]).scale).toBe(1)
  })

  it('amostras lentas seguidas derrubam um passo', () => {
    expect(run(Array(SLOW_SAMPLES_TO_DROP).fill(SLOW)).scale).toBe(0.9)
  })

  it('não desce abaixo do piso', () => {
    expect(run(Array(40).fill(SLOW)).scale).toBe(AUTO_SCALE_MIN)
  })

  it('sobe só depois de muitas amostras rápidas', () => {
    const state = { ...createAutoQuality(), scale: 0.8 }
    run(Array(FAST_SAMPLES_TO_RISE - 1).fill(FAST), state)
    expect(state.scale).toBe(0.8)
    run([FAST], state)
    expect(state.scale).toBe(0.9)
  })

  it('não volta à escala que foi lenta antes de o teto expirar: não oscila', () => {
    const state = run(Array(SLOW_SAMPLES_TO_DROP).fill(SLOW))
    run(Array(FAST_SAMPLES_TO_RISE * 2).fill(FAST), state)
    expect(state.scale).toBe(0.9)
    run(Array(CEILING_SAMPLES).fill(FAST), state)
    expect(state.scale).toBe(1)
  })

  it('amostra no meio do caminho zera as duas sequências', () => {
    const state = run([SLOW, MIDDLE, SLOW])
    expect(state.scale).toBe(1)
  })

  it('no teto, rápido continua rápido sem passar de 1', () => {
    expect(run(Array(FAST_SAMPLES_TO_RISE * 2).fill(FAST)).scale).toBe(1)
  })

  it('janela vazia ou monitor desconhecido não mexem em nada', () => {
    const state = createAutoQuality()
    stepAutoQuality(state, createFrameStats(), REFRESH_MS)
    stepAutoQuality(state, SLOW, 0)
    stepAutoQuality(state, SLOW, 0)
    expect([state.scale, state.slowStreak]).toEqual([1, 0])
  })
})
