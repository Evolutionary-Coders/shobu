import { describe, expect, it } from 'vitest'
import { daySkySpec, sunTravelDirection } from '../arena/daySky.ts'
import {
  arenaLightingSpec,
  LIGHT_TOTAL_INTENSITY_MAX,
  LIGHT_TOTAL_INTENSITY_MIN,
} from './arenaLightingSpec.ts'

describe('arenaLightingSpec', () => {
  /**
   * O sol do personagem é o sol do bake. Se os dois divergirem, o competidor
   * fica iluminado do lado em que o prédio atrás dele está na sombra.
   */
  it('a chave é o sol do céu', () => {
    const { key } = arenaLightingSpec()
    expect(key.directionM).toEqual(sunTravelDirection(daySkySpec()))
    expect(key.colorRgb).toEqual(daySkySpec().sunRgb)
  })

  it('soma de intensidade fica na faixa que lê numa sala acesa sem estourar', () => {
    const { key, fill } = arenaLightingSpec()
    expect(key.intensity + fill.intensity).toBeGreaterThanOrEqual(LIGHT_TOTAL_INTENSITY_MIN)
    expect(key.intensity + fill.intensity).toBeLessThanOrEqual(LIGHT_TOTAL_INTENSITY_MAX)
  })

  /** Céu frio por cima e rebote quente por baixo separam a face de cima da de baixo. */
  it('o céu é frio e o rebote do chão é quente', () => {
    const { fill } = arenaLightingSpec()
    expect(fill.skyRgb[2]).toBeGreaterThan(fill.skyRgb[0])
    expect(fill.groundRgb[0]).toBeGreaterThan(fill.groundRgb[2])
  })

  it('o primeiro quadro é o horizonte', () => {
    expect(arenaLightingSpec().skyClearRgb).toEqual(daySkySpec().horizonRgb)
  })

  it('toda cor fica entre 0 e 1', () => {
    const { key, fill, skyClearRgb } = arenaLightingSpec()
    for (const channel of [...key.colorRgb, ...fill.skyRgb, ...fill.groundRgb, ...skyClearRgb]) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })
})
