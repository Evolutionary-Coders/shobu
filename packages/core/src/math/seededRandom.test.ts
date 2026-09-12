import { describe, expect, it } from 'vitest'
import { createSeededRandom, nextUnit } from './seededRandom.ts'

function draw(seed: number, count: number): readonly number[] {
  const rng = createSeededRandom(seed)
  return Array.from({ length: count }, () => nextUnit(rng))
}

describe('seededRandom', () => {
  /**
   * A razão de existir: o servidor tem que reproduzir o cone de dispersão do
   * cliente a partir da mesma semente. `Math.random` não faria isso.
   */
  it('a mesma semente produz exatamente a mesma sequência', () => {
    expect(draw(7, 50)).toEqual(draw(7, 50))
  })

  it('sementes diferentes divergem já na primeira tirada', () => {
    expect(draw(7, 1)[0]).not.toBe(draw(8, 1)[0])
  })

  it('toda tirada fica em [0, 1)', () => {
    for (const value of draw(1234, 10_000)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  /** Sequência curta demais denunciaria o gerador logo no primeiro tiroteio. */
  it('não repete cedo', () => {
    expect(new Set(draw(99, 5_000)).size).toBe(5_000)
  })

  it('a média das tiradas fica perto do meio', () => {
    const values = draw(42, 20_000)
    const mean = values.reduce((total, value) => total + value, 0) / values.length
    expect(mean).toBeCloseTo(0.5, 1)
  })

  it('recusa semente que não é número', () => {
    expect(() => createSeededRandom(Number.NaN)).toThrow(/seed recebeu NaN/)
  })
})
