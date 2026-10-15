import { describe, expect, it } from 'vitest'
import { createNetStats } from './netStats.ts'

describe('createNetStats', () => {
  it('fecha a janela com quadros, inputs, fila e reconciliação, e zera', () => {
    const stats = createNetStats(1000)
    expect(stats.frame(0, undefined, null)).toBeUndefined()
    for (let seq = 1; seq <= 60; seq += 1) stats.sent(seq)
    stats.outcome('matched')
    stats.outcome('matched')
    stats.outcome('corrected')
    expect(stats.frame(500, 55, 12)).toBeUndefined()
    expect(stats.frame(1000, 57, 12)).toEqual({
      event: 'net.stats',
      windowS: 1,
      fps: 3,
      inputsPerS: 60,
      queue: 3,
      rttMs: 12,
      outcomes: { matched: 2, corrected: 1 },
    })
    expect(stats.frame(2000, undefined, null)).toMatchObject({
      inputsPerS: 0,
      queue: 0,
      outcomes: {},
    })
  })
})
