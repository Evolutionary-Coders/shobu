import { describe, expect, it } from 'vitest'
import {
  arenaFogSpec,
  arenaSightLineM,
  fogTransmittance,
  MIN_SIGHT_LINE_TRANSMITTANCE,
} from './arenaFogSpec.ts'
import { daySkySpec } from './daySky.ts'
import { ICHIBAN_GAI_PLAY_AREA } from './ichibanGai.ts'

describe('fogTransmittance', () => {
  it('não tira nada a distância zero', () => {
    expect(fogTransmittance(0.0035, 0)).toBe(1)
  })

  it('cai com a distância e nunca chega a zero', () => {
    const perto = fogTransmittance(0.0035, 50)
    const longe = fogTransmittance(0.0035, 500)
    expect(longe).toBeLessThan(perto)
    expect(longe).toBeGreaterThan(0)
  })

  it('sem densidade não há névoa a distância nenhuma', () => {
    expect(fogTransmittance(0, 1000)).toBe(1)
  })

  it('recusa densidade negativa', () => {
    expect(() => fogTransmittance(-1, 10)).toThrow(/density recebeu -1/)
  })
})

describe('arenaSightLineM', () => {
  it('mede a diagonal da área de jogo', () => {
    expect(arenaSightLineM(ICHIBAN_GAI_PLAY_AREA)).toBeCloseTo(Math.hypot(48, 60), 6)
  })

  it('recusa área degenerada, dizendo os lados', () => {
    expect(() => arenaSightLineM({ minX: 0, maxX: 0, minZ: 0, maxZ: 5 })).toThrow(
      /area recebeu 0 × 5 m/,
    )
  })
})

/**
 * A densidade é derivada da maior linha de visão: o alvo mais distante da
 * arena continua legível. A outra ponta — os prédios de fundo dissolvidos —
 * volta a ser testada quando o cenário de fundo existir.
 */
describe('arenaFogSpec', () => {
  const { density, colorRgb } = arenaFogSpec()

  it('deixa o alvo da quina oposta legível', () => {
    const sightLineM = arenaSightLineM(ICHIBAN_GAI_PLAY_AREA)
    expect(fogTransmittance(density, sightLineM)).toBeGreaterThanOrEqual(
      MIN_SIGHT_LINE_TRANSMITTANCE,
    )
  })

  it('a cor fica entre 0 e 1', () => {
    for (const channel of colorRgb) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })

  it('é a cor do horizonte do céu, senão a linha do horizonte reaparece', () => {
    expect(colorRgb).toEqual(daySkySpec().horizonRgb)
  })
})
