import { readFileSync } from 'node:fs'
import { maxDoubleJumpHeightM, maxJumpHeightM, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { GREYBOX_BLOCKOUT, GREYBOX_SPAWN_POINTS_M } from './greyboxBlockout.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

describe('GREYBOX_BLOCKOUT', () => {
  it('dá nome único a cada bloco, porque o nome é o que se procura no inspector', () => {
    const names = GREYBOX_BLOCKOUT.map((block) => block.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('não tem bloco de dimensão zero ou negativa', () => {
    const degenerate = GREYBOX_BLOCKOUT.filter((b) => b.sizeM.some((side) => side <= 0))
    expect(degenerate).toEqual([])
  })

  it('cobre as três camadas verticais que o gdd pede, além da casca', () => {
    expect(new Set(GREYBOX_BLOCKOUT.map((b) => b.layer))).toEqual(
      new Set(['shell', 'ground', 'mid', 'top']),
    )
  })
})

describe('GREYBOX_SPAWN_POINTS_M', () => {
  it('tem os doze pontos do gdd', () => {
    expect(GREYBOX_SPAWN_POINTS_M).toHaveLength(12)
  })

  it('nasce todo mundo acima do chão', () => {
    expect(GREYBOX_SPAWN_POINTS_M.every(([, y]) => y > 0)).toBe(true)
  })
})

/**
 * A arena tem que caber no que a movimentação alcança.
 *
 * As coberturas do chão nasceram com 3 m, e o pulo duplo chega a 2,68 m: elas
 * eram **impossíveis** de subir, não difíceis — e um jogador não distingue as
 * duas coisas, ele só conclui que o jogo está quebrado. Este teste é a ponte
 * entre o level design e os números de movimentação, que antes não se falavam.
 */
describe('o blockout cabe no envelope de pulo', () => {
  const groundCovers = GREYBOX_BLOCKOUT.filter((block) => block.layer === 'ground')

  it('encontra as coberturas do chão, senão o teste passaria vazio', () => {
    expect(groundCovers.length).toBeGreaterThan(0)
  })

  it('toda cobertura do chão é escalável com pulo duplo', () => {
    const reach = maxDoubleJumpHeightM(config)
    for (const block of groundCovers) {
      const topY = block.centerM[1] + block.sizeM[1] / 2
      expect(
        topY,
        `${block.name} tem topo em ${topY} e o alcance é ${reach.toFixed(2)}`,
      ).toBeLessThanOrEqual(reach)
    }
  })

  /** Cobertura mais baixa que o jogador não cobre nada: ele enxerga por cima. */
  it('toda cobertura do chão esconde um jogador em pé', () => {
    for (const block of groundCovers) {
      const topY = block.centerM[1] + block.sizeM[1] / 2
      expect(topY).toBeGreaterThanOrEqual(config.collision.capsuleHeightM)
    }
  })

  /** Se um pulo simples bastasse, a cobertura deixaria de ser obstáculo. */
  it('nenhuma cobertura do chão é alcançável com um pulo só', () => {
    const single = maxJumpHeightM(config)
    for (const block of groundCovers) {
      const topY = block.centerM[1] + block.sizeM[1] / 2
      expect(topY).toBeGreaterThan(single)
    }
  })
})
