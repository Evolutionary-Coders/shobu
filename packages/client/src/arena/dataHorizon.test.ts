import { readFileSync } from 'node:fs'
import { parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  DATA_HORIZON_FAR_PLANE_M,
  dataHorizonReachM,
  dataTowers,
  GRID_CELL_M,
  GRID_MAJOR_EVERY,
  GRID_PLANE_SIDE_M,
  GRID_PLANE_Y_M,
} from './dataHorizon.ts'
import { GREYBOX_BLOCKOUT } from './greyboxBlockout.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

const towers = dataTowers()
const arenaEdgeM = Math.max(
  ...GREYBOX_BLOCKOUT.map(({ centerM, sizeM }) =>
    Math.hypot(Math.abs(centerM[0]) + sizeM[0] / 2, Math.abs(centerM[2]) + sizeM[2] / 2),
  ),
)

describe('a grade do não-espaço', () => {
  /** Plano curto tem borda, e borda visível denuncia que o mundo acaba ali. */
  it('é maior que o alcance de qualquer torre', () => {
    expect(GRID_PLANE_SIDE_M / 2).toBeGreaterThan(dataHorizonReachM())
  })

  /** Piso da arena e grade em y = 0 disputam o mesmo pixel e a cena cintila. */
  it('fica abaixo do piso da arena, mas quase encostada', () => {
    expect(GRID_PLANE_Y_M).toBeLessThan(0)
    expect(GRID_PLANE_Y_M).toBeGreaterThan(-0.1)
  })

  /**
   * A célula é a régua do mapa: o jogador mede distância contando célula, e
   * uma célula que não casa com a escala humana não mede nada.
   */
  it('a célula tem escala humana', () => {
    expect(GRID_CELL_M).toBeGreaterThan(0)
    expect(config.collision.capsuleHeightM / GRID_CELL_M).toBeGreaterThanOrEqual(1)
    expect(config.collision.capsuleHeightM / GRID_CELL_M).toBeLessThanOrEqual(4)
  })

  /** Grade sem linha forte é papel quadriculado: some como padrão e não mede. */
  it('tem linha maior de tantas em tantas células', () => {
    expect(GRID_MAJOR_EVERY).toBeGreaterThan(1)
    expect(Number.isInteger(GRID_MAJOR_EVERY)).toBe(true)
  })
})

/**
 * O defeito que matou a cidade de fundo foi geométrico: a quina de uma cópia
 * entrava na arena. Este é o teste que a cidade nova não tem permissão de
 * repetir.
 */
describe('nenhuma torre entra na arena', () => {
  it('toda torre fica além da borda da arena, com folga', () => {
    for (const tower of towers) {
      const centreM = Math.hypot(tower.centerM[0], tower.centerM[2])
      const reachM = Math.hypot(tower.sizeM[0], tower.sizeM[2]) / 2
      expect(centreM - reachM, `${tower.name} chega perto demais`).toBeGreaterThan(arenaEdgeM * 2)
    }
  })
})

describe('as torres de dados', () => {
  it('são poucas, porque a névoa come quase tudo lá atrás', () => {
    expect(towers.length).toBeGreaterThan(2)
    expect(towers.length).toBeLessThanOrEqual(16)
  })

  it('assentam a base no chão do não-espaço', () => {
    for (const tower of towers) {
      expect(tower.centerM[1]).toBeCloseTo(tower.sizeM[1] / 2, 9)
    }
  })

  /** Torres iguais em fileira leem como dente de serra, não como horizonte. */
  it('nenhuma repete a altura de outra', () => {
    const heights = towers.map(({ sizeM }) => sizeM[1].toFixed(6))
    expect(new Set(heights).size).toBe(heights.length)
  })

  it('são mais altas que largas, senão são caixas e não torres', () => {
    for (const tower of towers) {
      expect(tower.sizeM[1]).toBeGreaterThan(tower.sizeM[0] * 3)
    }
  })

  /**
   * Paralaxe precisa de dois planos: com todas à mesma distância, andar pela
   * arena não move uma em relação à outra e o fundo volta a ser muro pintado.
   */
  it('ocupam pelo menos duas distâncias', () => {
    const radii = new Set(
      towers.map(({ centerM }) => Math.round(Math.hypot(centerM[0], centerM[2]) / 100)),
    )
    expect(radii.size).toBeGreaterThan(1)
  })

  it('dá nome único a cada torre', () => {
    const names = towers.map(({ name }) => name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('sai igual toda vez, porque o desvio é determinístico', () => {
    expect(dataTowers()).toEqual(towers)
  })
})

describe('DATA_HORIZON_FAR_PLANE_M', () => {
  it('alcança a torre mais distante, vista da quina oposta', () => {
    expect(DATA_HORIZON_FAR_PLANE_M).toBeGreaterThan(dataHorizonReachM())
  })

  it('vai além do alcance do hitscan, porque cenário não é alvo', () => {
    expect(DATA_HORIZON_FAR_PLANE_M).toBeGreaterThan(config.weapon.hitscanRangeM)
  })
})
