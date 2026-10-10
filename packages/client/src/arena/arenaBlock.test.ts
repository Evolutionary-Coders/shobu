import { describe, expect, it } from 'vitest'
import {
  blockBetween,
  blockTopM,
  halfTurn,
  type StairFlight,
  stairFlight,
  standingTierOf,
  withHalfTurnTwins,
} from './arenaBlock.ts'

describe('blockBetween', () => {
  it('põe o centro no meio dos cantos e o tamanho na diferença', () => {
    const block = blockBetween('mercado', 'building', 'mercado', [7, 0, 10], [17, 9, 22])
    expect(block).toEqual({
      name: 'mercado',
      layer: 'building',
      zone: 'mercado',
      centerM: [12, 4.5, 16],
      sizeM: [10, 9, 12],
    })
  })

  it('aceita os cantos em qualquer ordem', () => {
    const forward = blockBetween('a', 'cover', 'rua', [0, 0, 0], [2, 3, 4])
    const backward = blockBetween('a', 'cover', 'rua', [2, 3, 4], [0, 0, 0])
    expect(backward).toEqual(forward)
  })

  it('recusa bloco achatado, dizendo o nome e os cantos', () => {
    expect(() => blockBetween('laje', 'walkway', 'rua', [0, 1, 0], [4, 1, 4])).toThrow(
      /laje recebeu cantos \[0, 1, 0\] e \[4, 1, 4\]/,
    )
  })
})

describe('stairFlight', () => {
  const FLIGHT: StairFlight = {
    name: 'escada',
    zone: 'rua',
    runAxis: 'x',
    fromM: 0,
    toM: 3,
    acrossM: [10, 12],
    baseM: 0,
    topM: 0.9,
    steps: 3,
  }

  it('faz um bloco por degrau, com nome numerado a partir de 1', () => {
    expect(stairFlight(FLIGHT).map((step) => step.name)).toEqual([
      'escada-1',
      'escada-2',
      'escada-3',
    ])
  })

  it('sobe um degrau por bloco, até o topo pedido', () => {
    const tops = stairFlight(FLIGHT).map(blockTopM)
    expect(tops.map((top) => top.toFixed(3))).toEqual(['0.300', '0.600', '0.900'])
  })

  it('cada degrau é maciço desde a base', () => {
    for (const step of stairFlight(FLIGHT)) {
      expect(step.centerM[1] - step.sizeM[1] / 2).toBeCloseTo(0)
    }
  })

  it('corre no eixo x e ocupa a faixa pedida em z', () => {
    const [first] = stairFlight(FLIGHT)
    expect(first?.centerM[0]).toBeCloseTo(0.5)
    expect(first?.centerM[2]).toBeCloseTo(11)
    expect(first?.sizeM[2]).toBeCloseTo(2)
  })

  it('corre no eixo z, inclusive de trás para frente', () => {
    const steps = stairFlight({ ...FLIGHT, runAxis: 'z', fromM: 3, toM: 0 })
    expect(steps[0]?.centerM[2]).toBeCloseTo(2.5)
    expect(steps[0]?.centerM[0]).toBeCloseTo(11)
  })

  it('desce o degrau maciço até footM, quando a escada sai de uma passarela', () => {
    const steps = stairFlight({ ...FLIGHT, baseM: 4.5, topM: 5.4, footM: 0 })
    expect(steps[0]?.centerM[1]).toBeCloseTo(4.8 / 2)
    const last = steps.at(-1)
    if (!last) throw new Error('esperado ao menos um degrau')
    expect(blockTopM(last)).toBeCloseTo(5.4)
  })

  it.each([0, 2.5])('recusa steps %s, com o valor recebido', (steps) => {
    expect(() => stairFlight({ ...FLIGHT, steps })).toThrow(`escada recebeu steps ${steps}`)
  })
})

describe('withHalfTurnTwins', () => {
  const mercado = blockBetween('mercado', 'building', 'mercado', [7, 0, 10], [17, 9, 22])

  it('devolve o original e o gêmeo, com sufixos -a e -b', () => {
    expect(withHalfTurnTwins([mercado]).map((block) => block.name)).toEqual([
      'mercado-a',
      'mercado-b',
    ])
  })

  it('gira o centro do gêmeo e mantém o tamanho', () => {
    const [, twin] = withHalfTurnTwins([mercado])
    expect(twin?.centerM).toEqual([-12, 4.5, -16])
    expect(twin?.sizeM).toEqual(mercado.sizeM)
  })
})

describe('halfTurn', () => {
  it('troca o sinal de x e z e mantém y', () => {
    expect(halfTurn([3, 2, -5])).toEqual([-3, 2, 5])
  })

  it('não devolve -0, que quebraria comparação e nome', () => {
    expect(Object.is(halfTurn([0, 1, 0])[0], 0)).toBe(true)
    expect(Object.is(halfTurn([0, 1, 0])[2], 0)).toBe(true)
  })
})

describe('standingTierOf', () => {
  it.each([
    [0, 'chão'],
    [2.1, 'chão'],
    [4.5, 'meio'],
    [6.6, 'meio'],
    [9, 'topo'],
  ] as const)('%s m é %s', (floorM, tier) => {
    expect(standingTierOf(floorM)).toBe(tier)
  })
})
