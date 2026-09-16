import { describe, expect, it } from 'vitest'
import {
  arenaFogSpec,
  arenaSightLineM,
  fogTransmittance,
  MIN_SIGHT_LINE_TRANSMITTANCE,
} from './arenaFogSpec.ts'
import { GREYBOX_BLOCKOUT } from './greyboxBlockout.ts'
import { SKYLINE_RING_RADIUS_M } from './skylineRing.ts'

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
 * A densidade é derivada, e estes dois testes são as duas pontas da derivação:
 * o alvo mais distante da arena continua legível, e a cidade do anel não.
 * Mexer em `density` sem mexer numa das duas pontas reprova aqui.
 */
describe('arenaFogSpec', () => {
  const { density, colorRgb } = arenaFogSpec()

  it('deixa o alvo da quina oposta legível', () => {
    const sightLineM = arenaSightLineM(GREYBOX_BLOCKOUT)
    expect(fogTransmittance(density, sightLineM)).toBeGreaterThanOrEqual(
      MIN_SIGHT_LINE_TRANSMITTANCE,
    )
  })

  it('dissolve a cidade do anel, senão a névoa não serviu para nada', () => {
    expect(fogTransmittance(density, SKYLINE_RING_RADIUS_M)).toBeLessThan(
      MIN_SIGHT_LINE_TRANSMITTANCE,
    )
  })

  it('a cor fica entre 0 e 1', () => {
    for (const channel of colorRgb) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })

  /** Névoa clara num jogo noturno é o fundo errado para toda silhueta. */
  it('a cor é escura, porque é o fundo de toda silhueta da camada de cima', () => {
    const [r, g, b] = colorRgb
    expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeLessThan(0.2)
  })
})
