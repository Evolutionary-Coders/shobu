import { describe, expect, it } from 'vitest'
import {
  arenaFogSpec,
  arenaSightLineM,
  fogTransmittance,
  MIN_SIGHT_LINE_TRANSMITTANCE,
} from './arenaFogSpec.ts'
import { daySkySpec } from './daySky.ts'
import { GREYBOX_BLOCKOUT } from './greyboxBlockout.ts'

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
  it('mede a diagonal da maior pegada do blockout', () => {
    expect(arenaSightLineM(GREYBOX_BLOCKOUT)).toBeCloseTo(Math.hypot(64, 64), 6)
  })

  it('recusa blockout vazio', () => {
    expect(() => arenaSightLineM([])).toThrow(/blockout recebeu lista vazia/)
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
    const sightLineM = arenaSightLineM(GREYBOX_BLOCKOUT)
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
