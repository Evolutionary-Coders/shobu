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

/**
 * O jogo semeia cada tiro pelo contador de tiros, ou seja, com sementes
 * consecutivas. Sem embaralhar o estado inicial, tiros seguidos desviariam
 * para lados correlacionados — dispersão uniforme na teoria e enviesada na
 * prática, que é pior do que enviesada e assumida.
 */
describe('sementes consecutivas', () => {
  it('a primeira tirada de sementes vizinhas não anda em passo fixo', () => {
    const firstDraws = Array.from({ length: 64 }, (_, seed) => draw(seed, 1)[0] ?? 0)
    const steps = firstDraws.slice(1).map((value, index) => value - (firstDraws[index] ?? 0))
    expect(new Set(steps.map((step) => step.toFixed(6))).size).toBeGreaterThan(32)
  })

  it('a primeira tirada de sementes vizinhas cobre todo o intervalo', () => {
    const firstDraws = Array.from({ length: 200 }, (_, seed) => draw(seed, 1)[0] ?? 0)
    expect(Math.min(...firstDraws)).toBeLessThan(0.1)
    expect(Math.max(...firstDraws)).toBeGreaterThan(0.9)
  })
})
