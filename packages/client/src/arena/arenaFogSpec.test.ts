import { describe, expect, it } from 'vitest'
import { PANEL_LUMINANCE_MAX, PANEL_LUMINANCE_MIN } from '../renderer/greyboxSurfaceSpec.ts'
import {
  arenaFogSpec,
  arenaSightLineM,
  fogTransmittance,
  MIN_SIGHT_LINE_TRANSMITTANCE,
} from './arenaFogSpec.ts'
import { dataTowers } from './dataHorizon.ts'
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

  it('dissolve as torres do horizonte, senão a névoa não serviu para nada', () => {
    for (const tower of dataTowers()) {
      const distanceM = Math.hypot(tower.centerM[0], tower.centerM[2])
      expect(fogTransmittance(density, distanceM)).toBeLessThan(MIN_SIGHT_LINE_TRANSMITTANCE)
    }
  })

  /**
   * A névoa é o que separa um anel de torres do outro: se o de perto e o de
   * longe chegassem ao olho com a mesma transparência, a paralaxe existiria e
   * não seria vista.
   */
  it('separa um anel de torres do outro, que é o que faz a profundidade aparecer', () => {
    const vistas = dataTowers()
      .map((tower) => Math.hypot(tower.centerM[0], tower.centerM[2]))
      .sort((a, b) => a - b)
      .map((distanceM) => fogTransmittance(density, distanceM))
    const perto = vistas[0]
    const longe = vistas[vistas.length - 1]
    if (perto === undefined || longe === undefined) throw new Error('esperado torres')
    expect(longe).toBeLessThan(perto * 0.5)
  })

  it('a cor fica entre 0 e 1', () => {
    for (const channel of colorRgb) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })

  /**
   * O horizonte é meio-tom, não preto e não claro: escuro demais e o corpo do
   * competidor, que é a coisa mais escura da cena, some dentro dele; claro
   * demais e ele vira a parte mais brilhante da imagem (ADR 0009).
   */
  it('a cor fica na faixa de meio-tom do ambiente', () => {
    const [r, g, b] = colorRgb
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    expect(luminance).toBeGreaterThan(PANEL_LUMINANCE_MIN)
    expect(luminance).toBeLessThan(PANEL_LUMINANCE_MAX)
  })
})
