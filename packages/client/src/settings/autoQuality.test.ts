import { describe, expect, it } from 'vitest'
import { createFrameStats, type FrameStats } from '../instrumentation/frameMeter.ts'
import {
  AUTO_SCALE_MIN,
  CEILING_SAMPLES,
  createAutoQuality,
  FAST_SAMPLES_TO_RISE,
  referenceFrameMs,
  SLOW_SAMPLES_TO_DROP,
  stepAutoQuality,
  TARGET_FRAME_MS,
} from './autoQuality.ts'

const AT_60: FrameStats = { ...createFrameStats(), frames: 120, fastestMs: 16.7 }
const SLOW: FrameStats = { ...AT_60, p95Ms: 33.3 }
const FAST: FrameStats = { ...AT_60, p95Ms: 16.7 }
const MIDDLE: FrameStats = { ...AT_60, p95Ms: 19 }

function run(samples: readonly FrameStats[], state = createAutoQuality()) {
  for (const stats of samples) stepAutoQuality(state, stats)
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

  it('janela vazia não mexe em nada', () => {
    const state = createAutoQuality()
    stepAutoQuality(state, createFrameStats())
    expect([state.scale, state.slowStreak]).toEqual([1, 0])
  })

  /** Revisão do #23: num monitor de 144 Hz, 100 FPS derrubavam a resolução até 0,6. */
  it('100 FPS num monitor de 144 Hz não é lento: o alvo é 60', () => {
    const at144 = { ...AT_60, fastestMs: 1000 / 144, p95Ms: 10 }
    expect(run(Array(10).fill(at144)).scale).toBe(1)
  })

  /** Revisão do #23: 35 FPS estáveis num monitor de 60 Hz viravam a própria referência. */
  it('35 FPS estáveis num monitor de 60 Hz é lento', () => {
    const stuck = { ...AT_60, medianMs: 28.6, p95Ms: 33.3 }
    expect(run(Array(SLOW_SAMPLES_TO_DROP).fill(stuck)).scale).toBe(0.9)
  })
})

describe('referenceFrameMs', () => {
  it('é o alvo de 60 FPS, ou o monitor quando ele é mais lento', () => {
    expect(referenceFrameMs(1000 / 144)).toBeCloseTo(TARGET_FRAME_MS)
    expect(referenceFrameMs(1000 / 30)).toBeCloseTo(1000 / 30)
  })
})
