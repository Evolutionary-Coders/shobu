import { describe, expect, it } from 'vitest'
import { BILLBOARD_OFFSETS, billboardStepAt } from './billboardCycle.ts'

describe('billboardStepAt', () => {
  it('anda um passo por período e volta ao começo depois do quarto', () => {
    expect([0, 5.9, 6, 12, 18, 24].map((t) => billboardStepAt(t, 6))).toEqual([0, 0, 1, 2, 3, 0])
  })

  it('tempo negativo é o começo, não um índice negativo', () => {
    expect(billboardStepAt(-3, 6)).toBe(0)
  })

  it('recusa período que não anda', () => {
    expect(() => billboardStepAt(1, 0)).toThrow(/periodS recebeu 0; esperado número > 0/)
  })
})

describe('BILLBOARD_OFFSETS', () => {
  /** Somar o mesmo deslocamento a células diferentes nunca junta duas: é permutação. */
  it('leva as quatro células às quatro células, em todo passo', () => {
    const cells = [
      [0, 0],
      [0.5, 0],
      [0, 0.5],
      [0.5, 0.5],
    ]
    for (const [du, dv] of BILLBOARD_OFFSETS) {
      const moved = cells.map(([u = 0, v = 0]) => `${(u + du) % 1},${(v + dv) % 1}`)
      expect(new Set(moved).size).toBe(4)
    }
  })
})
