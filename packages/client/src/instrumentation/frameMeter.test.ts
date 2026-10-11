import { describe, expect, it } from 'vitest'
import { createFrameMeter, createFrameStats, FRAME_WINDOW, HITCH_FACTOR } from './frameMeter.ts'

function measure(frames: readonly number[], windowSize = FRAME_WINDOW) {
  const meter = createFrameMeter(windowSize)
  for (const ms of frames) meter.push(ms)
  return meter.stats(createFrameStats())
}

describe('createFrameMeter', () => {
  it('sem quadro nenhum, tudo zero', () => {
    expect(measure([])).toEqual(createFrameStats())
  })

  it('60 Hz cravado: 60 FPS, sem cauda e sem travada', () => {
    const stats = measure(Array(120).fill(1000 / 60))
    expect(stats.fps).toBeCloseTo(60)
    expect(stats.p99Ms).toBeCloseTo(1000 / 60)
    expect(stats.hitches).toBe(0)
  })

  it('a média esconde a travada, e o p99 e o pior quadro a mostram', () => {
    const stats = measure([...Array(99).fill(7), 120])
    expect(stats.medianMs).toBe(7)
    expect(stats.p99Ms).toBe(7)
    expect(stats.worstMs).toBe(120)
    expect(stats.fastestMs).toBe(7)
    expect(stats.hitches).toBe(1)
  })

  it('o p95 é um quadro de verdade, sem interpolar', () => {
    const frames = Array.from({ length: 100 }, (_, index) => index + 1)
    const stats = measure(frames)
    expect([stats.p95Ms, stats.p99Ms]).toEqual([95, 99])
  })

  it('travada é relativa à mediana', () => {
    const limit = 10 * HITCH_FACTOR
    expect(measure([10, 10, 10, limit]).hitches).toBe(0)
    expect(measure([10, 10, 10, limit + 0.1]).hitches).toBe(1)
  })

  it('a janela desliza: o quadro antigo sai', () => {
    const stats = measure([500, 10, 10, 10], 3)
    expect([stats.frames, stats.worstMs]).toEqual([3, 10])
  })

  it('ignora intervalo que não é quadro: zero, negativo, infinito ou NaN', () => {
    expect(measure([0, -4, Number.POSITIVE_INFINITY, Number.NaN]).frames).toBe(0)
  })

  it('reset esvazia a janela', () => {
    const meter = createFrameMeter()
    meter.push(16)
    meter.reset()
    expect(meter.stats(createFrameStats()).frames).toBe(0)
  })

  it('escreve no objeto recebido', () => {
    const into = createFrameStats()
    const meter = createFrameMeter()
    meter.push(16)
    expect(meter.stats(into)).toBe(into)
  })

  it.each([0, -1, 2.5])('recusa janela %s', (size) => {
    expect(() => createFrameMeter(size)).toThrow(/windowSize recebeu/)
  })
})
