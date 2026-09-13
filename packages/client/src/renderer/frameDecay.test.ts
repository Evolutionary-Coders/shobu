import { describe, expect, it } from 'vitest'
import { followFraction } from './frameDecay.ts'

describe('followFraction', () => {
  /** Meio segundo de engasgada ainda deixa resto: a aproximação linear zerava. */
  it('não satura num quadro longo, onde a aproximação linear zerava', () => {
    expect(followFraction(0.5, 6)).toBeLessThan(1)
    expect(followFraction(0.5, 6)).toBeGreaterThan(0.9)
    expect(Math.min(1, 0.5 * 6)).toBe(1)
  })

  it('quadro de duração zero não anda nada', () => {
    expect(followFraction(0, 6)).toBe(0)
  })

  /** Perto de zero ela concorda com a aproximação linear que substituiu. */
  it('num quadro curto vale quase o mesmo que a taxa vezes o tempo', () => {
    expect(followFraction(1 / 60, 6)).toBeCloseTo(6 / 60, 2)
  })

  it('taxa maior persegue mais rápido', () => {
    expect(followFraction(1 / 60, 12)).toBeGreaterThan(followFraction(1 / 60, 6))
  })
})
