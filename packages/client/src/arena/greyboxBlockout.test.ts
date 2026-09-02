import { describe, expect, it } from 'vitest'
import { GREYBOX_BLOCKOUT, GREYBOX_SPAWN_POINTS_M } from './greyboxBlockout.ts'

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
