import { describe, expect, it } from 'vitest'
import { spreadTangent } from './spreadTangent.ts'

describe('spreadTangent', () => {
  it('semi-ângulo zero devolve tangente zero: a mira exata não desvia', () => {
    expect(spreadTangent(0)).toBe(0)
  })

  it('converte grau em tangente', () => {
    expect(spreadTangent(45)).toBeCloseTo(1, 5)
    expect(spreadTangent(4.5)).toBeCloseTo(0.0787, 4)
  })

  /**
   * O arredondamento é a razão de este módulo existir: cliente e servidor têm
   * que chegar ao mesmo cone, e o último bit de `Math.tan` não é garantido.
   */
  it('o resultado cai numa grade fixa, igual em qualquer build', () => {
    const tangent = spreadTangent(4.5)
    expect(Math.round(tangent * 1e6)).toBe(tangent * 1e6)
  })

  it('ângulo maior espalha mais', () => {
    expect(spreadTangent(9)).toBeGreaterThan(spreadTangent(4.5))
  })

  it('recusa ângulo que não fecha um cone', () => {
    expect(() => spreadTangent(-1)).toThrow(/semiAngleDeg recebeu -1/)
    expect(() => spreadTangent(90)).toThrow(/semiAngleDeg recebeu 90/)
  })
})
