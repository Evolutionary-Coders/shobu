import { describe, expect, it } from 'vitest'
import {
  arenaLightingSpec,
  keyLightDirection,
  LIGHT_TOTAL_INTENSITY_MAX,
  LIGHT_TOTAL_INTENSITY_MIN,
} from './arenaLightingSpec.ts'

describe('arenaLightingSpec', () => {
  /** Chave que aponta para cima ilumina o teto que a arena não tem. */
  it('a chave vem de cima', () => {
    expect(arenaLightingSpec().key.directionM[1]).toBeLessThan(0)
  })

  /**
   * Abaixo do piso o painel escuro de `cyberspaceSurface.ts` some no preto, e
   * com ele a silhueta do alvo; acima do teto a face virada para a chave
   * estoura em branco e a arena volta a ler como pátio de dia. Os dois limites
   * são o motivo de a luz ser dado e não número solto no adapter.
   */
  it('soma de intensidade fica na faixa que a arena escura lê', () => {
    const { key, fill } = arenaLightingSpec()
    expect(key.intensity + fill.intensity).toBeGreaterThanOrEqual(LIGHT_TOTAL_INTENSITY_MIN)
    expect(key.intensity + fill.intensity).toBeLessThanOrEqual(LIGHT_TOTAL_INTENSITY_MAX)
  })

  /**
   * É a temperatura que separa a face de cima da face de lado e da de baixo.
   * A chave é fria — claridade da cidade no céu, não sol —, e o que vem de
   * baixo é quente, porque é o neon do chão batendo por baixo das plataformas.
   */
  it('a chave é fria e o rebote do chão é quente', () => {
    const { key, fill } = arenaLightingSpec()
    expect(key.colorRgb[2]).toBeGreaterThan(key.colorRgb[0])
    expect(fill.skyRgb[2]).toBeGreaterThan(fill.skyRgb[0])
    expect(fill.groundRgb[0]).toBeGreaterThan(fill.groundRgb[2])
  })

  it('toda cor fica entre 0 e 1', () => {
    const { key, fill, skyClearRgb, points } = arenaLightingSpec()
    const pointColours = points.flatMap(({ colorRgb }) => [...colorRgb])
    for (const channel of [
      ...key.colorRgb,
      ...fill.skyRgb,
      ...fill.groundRgb,
      ...skyClearRgb,
      ...pointColours,
    ]) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })
})

/**
 * As luzes com lugar existem para a arena ter posição com nome. Estes testes
 * guardam as três coisas que fazem isso funcionar: elas são duas (o quarto
 * slot do `StandardMaterial`), têm cores diferentes, e o alcance de cada uma
 * morre antes da outra — se somarem no centro, voltam a ser luz global.
 */
describe('as luzes com lugar', () => {
  const { points } = arenaLightingSpec()

  it('cabem nos quatro slots do material, com a chave e o preenchimento', () => {
    expect(points).toHaveLength(2)
  })

  it('têm cores distintas, senão nomeiam o mesmo lugar duas vezes', () => {
    const colours = points.map(({ colorRgb }) => colorRgb.join())
    expect(new Set(colours).size).toBe(colours.length)
  })

  it('não se alcançam, senão as duas viram uma luz global só', () => {
    const [first, second] = points
    if (!first || !second) throw new Error('esperado duas luzes com lugar')
    const gapM = Math.hypot(
      first.positionM[0] - second.positionM[0],
      first.positionM[1] - second.positionM[1],
      first.positionM[2] - second.positionM[2],
    )
    expect(first.rangeM + second.rangeM).toBeLessThan(gapM * 2.2)
  })

  it('dá nome único a cada uma', () => {
    const names = points.map(({ name }) => name)
    expect(new Set(names).size).toBe(names.length)
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
