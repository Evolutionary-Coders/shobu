import { describe, expect, it } from 'vitest'
import {
  boundaryRemainingS,
  createBoundaryClock,
  isInsidePlayArea,
  type PlayArea,
  stepBoundary,
} from './playArea.ts'

const AREA: PlayArea = { minX: -24, maxX: 24, minZ: -30, maxZ: 30 }
const INSIDE = { x: 0, y: 0, z: 0 }
const OUTSIDE = { x: 30, y: 0, z: 0 }
const GRACE_S = 5
/** Um quarto de segundo é exato em binário: a soma chega a 5 sem erro de arredondamento. */
const DT_S = 0.25

describe('isInsidePlayArea', () => {
  it('o centro está dentro', () => {
    expect(isInsidePlayArea(AREA, INSIDE)).toBe(true)
  })

  /** A borda é a linha que o jogador vê: pisar nela não pode abrir contagem. */
  it.each([
    ['oeste', { x: -24, y: 0, z: 0 }],
    ['leste', { x: 24, y: 0, z: 0 }],
    ['sul', { x: 0, y: 0, z: -30 }],
    ['norte', { x: 0, y: 0, z: 30 }],
    ['quina', { x: 24, y: 0, z: 30 }],
  ])('a borda %s conta como dentro', (_side, feetM) => {
    expect(isInsidePlayArea(AREA, feetM)).toBe(true)
  })

  it.each([
    ['oeste', { x: -24.001, y: 0, z: 0 }],
    ['leste', { x: 24.001, y: 0, z: 0 }],
    ['sul', { x: 0, y: 0, z: -30.001 }],
    ['norte', { x: 0, y: 0, z: 30.001 }],
  ])('um milímetro além da borda %s está fora', (_side, feetM) => {
    expect(isInsidePlayArea(AREA, feetM)).toBe(false)
  })

  it('a altura não tira ninguém da área', () => {
    expect(isInsidePlayArea(AREA, { x: 0, y: 500, z: 0 })).toBe(true)
    expect(isInsidePlayArea(AREA, { x: 0, y: -500, z: 0 })).toBe(true)
  })
})

describe('stepBoundary', () => {
  it('dentro devolve inside e deixa o relógio em zero', () => {
    const clock = createBoundaryClock()
    expect(stepBoundary(clock, AREA, INSIDE, DT_S, GRACE_S)).toBe('inside')
    expect(clock.outsideS).toBe(0)
  })

  it('fora devolve warning e soma o tick', () => {
    const clock = createBoundaryClock()
    expect(stepBoundary(clock, AREA, OUTSIDE, DT_S, GRACE_S)).toBe('warning')
    expect(stepBoundary(clock, AREA, OUTSIDE, DT_S, GRACE_S)).toBe('warning')
    expect(clock.outsideS).toBe(2 * DT_S)
  })

  /** Voltar zera, não pausa: o aviso é para quem se perdeu, não um saldo a gastar. */
  it('voltar para dentro zera o relógio', () => {
    const clock = createBoundaryClock()
    for (let tick = 0; tick < 10; tick += 1) stepBoundary(clock, AREA, OUTSIDE, DT_S, GRACE_S)
    stepBoundary(clock, AREA, INSIDE, DT_S, GRACE_S)
    expect(clock.outsideS).toBe(0)
  })

  it('o tick que atinge o prazo devolve expired, e o anterior ainda é warning', () => {
    const clock = createBoundaryClock()
    const ticksToExpire = GRACE_S / DT_S
    const statuses = Array.from({ length: ticksToExpire }, () =>
      stepBoundary(clock, AREA, OUTSIDE, DT_S, GRACE_S),
    )
    expect(statuses.slice(0, -1).every((status) => status === 'warning')).toBe(true)
    expect(statuses.at(-1)).toBe('expired')
  })

  it('o tick que passa do prazo sem cair nele também devolve expired', () => {
    const clock = createBoundaryClock()
    clock.outsideS = 4.9
    expect(stepBoundary(clock, AREA, OUTSIDE, 0.3, GRACE_S)).toBe('expired')
  })

  /** Quem reaparece não pode herdar uma contagem já vencida. */
  it('expirar zera o relógio', () => {
    const clock = createBoundaryClock()
    clock.outsideS = GRACE_S - DT_S
    stepBoundary(clock, AREA, OUTSIDE, DT_S, GRACE_S)
    expect(clock.outsideS).toBe(0)
  })

  it('a mesma sequência de posições dá a mesma sequência de estados', () => {
    const path = [INSIDE, OUTSIDE, OUTSIDE, INSIDE, OUTSIDE]
    const run = (): readonly string[] => {
      const clock = createBoundaryClock()
      return path.map((feetM) => stepBoundary(clock, AREA, feetM, DT_S, GRACE_S))
    }
    expect(run()).toEqual(run())
  })

  it('dt zero é legítimo: o quadro que não andou não conta tempo', () => {
    const clock = createBoundaryClock()
    expect(stepBoundary(clock, AREA, OUTSIDE, 0, GRACE_S)).toBe('warning')
    expect(clock.outsideS).toBe(0)
  })

  it.each([
    ['x', { ...AREA, maxX: AREA.minX }, /minX -24, maxX -24/],
    ['z', { ...AREA, minZ: 40 }, /minZ 40, maxZ 30/],
    ['NaN', { ...AREA, maxX: Number.NaN }, /maxX NaN/],
  ])('recusa área degenerada em %s citando os limites', (_axis, area, message) => {
    expect(() => stepBoundary(createBoundaryClock(), area, INSIDE, DT_S, GRACE_S)).toThrow(message)
  })

  it.each([
    [-0.1, /dtS recebeu -0.1/],
    [Number.NaN, /dtS recebeu NaN/],
    [Number.POSITIVE_INFINITY, /dtS recebeu Infinity/],
  ])('recusa dt %s citando o valor', (dtS, message) => {
    expect(() => stepBoundary(createBoundaryClock(), AREA, INSIDE, dtS, GRACE_S)).toThrow(message)
  })

  it.each([
    [0, /graceS recebeu 0/],
    [Number.POSITIVE_INFINITY, /graceS recebeu Infinity/],
  ])('recusa prazo %s citando o valor', (graceS, message) => {
    expect(() => stepBoundary(createBoundaryClock(), AREA, INSIDE, DT_S, graceS)).toThrow(message)
  })
})

describe('boundaryRemainingS', () => {
  it('é o prazo inteiro com o relógio zerado', () => {
    expect(boundaryRemainingS(createBoundaryClock(), GRACE_S)).toBe(GRACE_S)
  })

  it('desconta o tempo já passado fora', () => {
    expect(boundaryRemainingS({ outsideS: 1.5 }, GRACE_S)).toBe(3.5)
  })

  it('nunca fica negativo', () => {
    expect(boundaryRemainingS({ outsideS: 9 }, GRACE_S)).toBe(0)
  })
})
