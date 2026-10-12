import { COLLIDER_GRAPPLE_ONLY } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { lanternPointsOn, wireLanterns, withHalfTurnWires } from './lanternWires.ts'

const STRAIGHT = { start: [0, 6, 0], end: [0, 6, 12], sagM: 0 } as const

describe('lanternWires', () => {
  it('pendura uma lanterna a cada 1,5 m, sem encostar nas pontas', () => {
    const points = lanternPointsOn(STRAIGHT)
    // (12 - 1,5) / 1,5 = 7 vagas, a 1/8 do fio uma da outra.
    expect(points).toHaveLength(7)
    expect(points[0]).toEqual([0, 6, 1.5])
    expect(points[6]?.[2]).toBeCloseTo(10.5)
  })

  it('fio curto ainda leva uma lanterna, no meio', () => {
    expect(lanternPointsOn({ start: [0, 6, 0], end: [0, 6, 1], sagM: 0 })).toEqual([[0, 6, 0.5]])
  })

  it('o fio cede no meio: a lanterna do meio fica mais baixa que as pontas', () => {
    const points = lanternPointsOn({ ...STRAIGHT, sagM: 1 })
    expect(points[3]?.[1]).toBeCloseTo(5)
    expect(points[0]?.[1]).toBeGreaterThan(5)
  })

  it('a caixa é o barril, 35 cm abaixo do fio, e só o gancho a enxerga', () => {
    const [first] = wireLanterns('lanterna', [STRAIGHT])
    expect(first?.mask).toBe(COLLIDER_GRAPPLE_ONLY)
    expect(first?.centerM[1]).toBeCloseTo(6 - 0.35 - 0.25)
    const [width, height, depth] = first?.sizeM ?? [0, 0, 0]
    expect([width, height, depth].map((side) => Math.round(side * 100))).toEqual([64, 50, 64])
  })

  it('cada fio vem com o gêmeo girado meia volta, logo depois dele', () => {
    expect(withHalfTurnWires([STRAIGHT])).toEqual([
      STRAIGHT,
      { start: [0, 6, 0], end: [0, 6, -12], sagM: 0 },
    ])
  })
})
