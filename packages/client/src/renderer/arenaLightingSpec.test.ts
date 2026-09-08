import { describe, expect, it } from 'vitest'
import {
  arenaLightingSpec,
  keyLightDirection,
  LIGHT_TOTAL_INTENSITY_MAX,
} from './arenaLightingSpec.ts'

describe('arenaLightingSpec', () => {
  /** Chave que aponta para cima ilumina o teto que a arena não tem. */
  it('a chave vem de cima', () => {
    expect(arenaLightingSpec().key.directionM[1]).toBeLessThan(0)
  })

  /**
   * Abaixo do piso a arena volta a ficar escura e chapada; acima do teto a
   * face virada para a chave estoura em branco. Os dois limites são o motivo
   * de a luz ser dado e não número solto no adapter.
   */
  it('soma de intensidade fica na faixa que o greybox lê', () => {
    const { key, fill } = arenaLightingSpec()
    expect(key.intensity + fill.intensity).toBeGreaterThan(1.5)
    expect(key.intensity + fill.intensity).toBeLessThanOrEqual(LIGHT_TOTAL_INTENSITY_MAX)
  })

  /** Chave quente, preenchimento frio: é a temperatura que separa as faces. */
  it('chave e preenchimento têm temperaturas opostas', () => {
    const { key, fill } = arenaLightingSpec()
    expect(key.colorRgb[0]).toBeGreaterThan(key.colorRgb[2])
    expect(fill.skyRgb[2]).toBeGreaterThan(fill.skyRgb[0])
  })

  it('toda cor fica entre 0 e 1', () => {
    const { key, fill, skyClearRgb } = arenaLightingSpec()
    for (const channel of [...key.colorRgb, ...fill.skyRgb, ...fill.groundRgb, ...skyClearRgb]) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })
})

describe('keyLightDirection', () => {
  it('devolve vetor unitário na direção da chave', () => {
    const [x, y, z] = keyLightDirection(arenaLightingSpec())
    expect(Math.hypot(x, y, z)).toBeCloseTo(1)
    expect(y).toBeLessThan(0)
  })

  it('recusa direção nula', () => {
    const spec = { ...arenaLightingSpec() }
    const broken = { ...spec, key: { ...spec.key, directionM: [0, 0, 0] as const } }
    expect(() => keyLightDirection(broken)).toThrow(/key.directionM recebeu \[0, 0, 0\]/)
  })
})
