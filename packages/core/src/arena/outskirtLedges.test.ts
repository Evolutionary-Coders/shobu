import { describe, expect, it } from 'vitest'
import { blockBetween, blockTopM, type GreyboxBlock } from './arenaBlock.ts'
import { GROUND_FLOOR_M, outskirtLedges, STOREY_M } from './outskirtLedges.ts'

const WORLD = { halfWidthM: 50, halfDepthM: 50 }

/** Um prédio de 10 × 10 m a leste da origem: a face da frente é a de x 10. */
const TOWER = blockBetween('torre', 'outskirt', 'rua', [10, 0, -5], [20, 20, 5])

function ledgesOf(outskirts: readonly GreyboxBlock[], solid: readonly GreyboxBlock[] = outskirts) {
  return outskirtLedges(outskirts, solid, WORLD)
}

function named(ledges: readonly GreyboxBlock[], prefix: string): readonly GreyboxBlock[] {
  return ledges.filter((ledge) => ledge.name.startsWith(prefix))
}

function first(blocks: readonly GreyboxBlock[]): GreyboxBlock {
  const [block] = blocks
  if (!block) throw new Error('esperado ao menos um bloco; recebeu lista vazia')
  return block
}

function lowOf({ centerM: [x, y, z], sizeM: [w, h, d] }: GreyboxBlock): readonly number[] {
  return [x - w / 2, y - h / 2, z - d / 2]
}

function rounded(values: readonly number[]): readonly number[] {
  return values.map((value) => Math.round(value * 1000) / 1000)
}

function highOf({ centerM: [x, y, z], sizeM: [w, h, d] }: GreyboxBlock): readonly number[] {
  return [x + w / 2, y + h / 2, z + d / 2]
}

function bottomOf(block: GreyboxBlock): number {
  return block.centerM[1] - block.sizeM[1] / 2
}

describe('outskirtLedges', () => {
  /** Regressão de 06/10: toldo e escada eram só pele, e o jogador atravessava os dois. */
  it('põe toldo nas quatro faces abertas, como laje com colisão', () => {
    const awnings = named(ledgesOf([TOWER]), 'toldo-')
    expect(awnings).toHaveLength(4)
    expect(awnings.every((awning) => awning.layer === 'ledge')).toBe(true)
  })

  it('o toldo vai de 2,6 a 3 m, sai 1,1 m da fachada e recua 0,3 m das quinas', () => {
    const front = first(named(ledgesOf([TOWER]), 'toldo-torre-x-'))
    expect(rounded(lowOf(front))).toEqual([8.9, 2.6, -4.7])
    expect(rounded(highOf(front))).toEqual([10, 3, 4.7])
  })

  it('não põe nada na face colada noutro bloco', () => {
    const neighbour = blockBetween('vizinho', 'outskirt', 'rua', [20, 0, -5], [30, 12, 5])
    const ledges = ledgesOf([TOWER], [TOWER, neighbour])
    expect(named(ledges, 'toldo-torre-x+')).toHaveLength(0)
  })

  it('não põe nada na face que dá para fora do mundo', () => {
    const atEdge = blockBetween('borda', 'outskirt', 'rua', [40, 0, -5], [50, 12, 5])
    expect(named(ledgesOf([atEdge]), 'toldo-borda-x+')).toHaveLength(0)
  })

  it('põe escada de incêndio na face da frente e na de trás, um patamar por andar', () => {
    const platforms = named(ledgesOf([TOWER]), 'patamar-')
    const tops = new Set(platforms.map(blockTopM))
    expect([...tops]).toEqual([6.6, 9.8, 13, 16.2])
    expect(new Set(platforms.map((platform) => platform.name.slice(0, 17)))).toEqual(
      new Set(['patamar-torre-x--', 'patamar-torre-x+-']),
    )
    expect(blockTopM(first(platforms))).toBe(GROUND_FLOOR_M + STOREY_M)
  })

  it('desce cada lance em três caixas escalonadas, entre o patamar e o de baixo', () => {
    const ledges = ledgesOf([TOWER])
    const flight = named(ledges, 'degrau-torre-x--1-')
    expect(flight).toHaveLength(3)
    const tops = flight.map(blockTopM)
    expect(Math.max(...tops)).toBeLessThan(9.8 - 0.08)
    expect(Math.min(...flight.map((step) => bottomOf(step)))).toBeGreaterThan(6.6)
  })

  it('troca o lado do lance andar sim, andar não', () => {
    const ledges = ledgesOf([TOWER])
    const firstStepZ = (index: number) =>
      first(named(ledges, `degrau-torre-x--${index}-0`)).centerM[2]
    expect(firstStepZ(0)).toBeGreaterThan(0)
    expect(firstStepZ(1)).toBeLessThan(0)
  })

  it('não põe escada em prédio baixo nem em fachada curta', () => {
    const low = blockBetween('baixo', 'outskirt', 'rua', [10, 0, -5], [20, 9, 5])
    const narrow = blockBetween('estreito', 'outskirt', 'rua', [10, 0, -3], [20, 20, 3])
    expect(named(ledgesOf([low]), 'patamar-')).toHaveLength(0)
    expect(named(ledgesOf([narrow]), 'patamar-')).toHaveLength(0)
  })

  it('tira a laje que entraria noutro bloco', () => {
    const car = blockBetween('carro', 'lowCover', 'rua', [8, 0, -1], [9.5, 2.8, 1])
    const ledges = ledgesOf([TOWER], [TOWER, car])
    expect(named(ledges, 'toldo-torre-x-')).toHaveLength(0)
    expect(named(ledges, 'toldo-torre-x+')).toHaveLength(1)
  })
})
