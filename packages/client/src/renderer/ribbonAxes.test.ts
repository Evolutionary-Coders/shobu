import { dot } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createRibbonAxes, ribbonAxes } from './ribbonAxes.ts'

const ORIGIN = { x: 0, y: 0, z: 0 }

describe('ribbonAxes', () => {
  it('devolve o comprimento do feixe', () => {
    expect(
      ribbonAxes(ORIGIN, { x: 0, y: 0, z: 40 }, { x: 3, y: 0, z: 20 }, createRibbonAxes()),
    ).toBe(40)
  })

  it('a face aponta para o ponto do feixe mais perto do olho', () => {
    const axes = createRibbonAxes()
    ribbonAxes(ORIGIN, { x: 0, y: 0, z: 40 }, { x: 3, y: 0, z: 20 }, axes)
    expect(axes.facing.x).toBeCloseTo(1)
    expect(axes.along.z).toBeCloseTo(1)
  })

  it('o feixe que sai do cano vira para o olho atrás dele', () => {
    const axes = createRibbonAxes()
    ribbonAxes({ x: 0.1, y: -0.1, z: 0.5 }, { x: 0, y: 0, z: 30 }, ORIGIN, axes)
    const toEye = { x: -0.1, y: 0.1, z: -0.5 }
    expect(dot(axes.facing, toEye)).toBeGreaterThan(0)
  })

  it('os três eixos são unitários e perpendiculares, de mão esquerda', () => {
    const axes = createRibbonAxes()
    ribbonAxes({ x: 1, y: 2, z: 3 }, { x: -7, y: 4, z: 11 }, { x: 5, y: -1, z: 2 }, axes)
    const { side, facing, along } = axes
    for (const axis of [side, facing, along]) expect(dot(axis, axis)).toBeCloseTo(1)
    expect(dot(side, facing)).toBeCloseTo(0)
    expect(dot(side, along)).toBeCloseTo(0)
    expect(dot(facing, along)).toBeCloseTo(0)
    // mão esquerda, como o babylon: x = y × z com a fórmula de sempre.
    expect(side.x).toBeCloseTo(facing.y * along.z - facing.z * along.y)
  })

  it('com o olho em cima da linha, a face vira para o cima do mundo', () => {
    const axes = createRibbonAxes()
    ribbonAxes(ORIGIN, { x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -2 }, axes)
    expect(axes.facing.y).toBeCloseTo(1)
  })

  it('feixe vertical com o olho na linha usa o x como face', () => {
    const axes = createRibbonAxes()
    ribbonAxes(ORIGIN, { x: 0, y: 10, z: 0 }, { x: 0, y: 20, z: 0 }, axes)
    expect(Math.abs(axes.facing.x)).toBeCloseTo(1)
  })

  it('feixe de comprimento zero não vira NaN', () => {
    const axes = createRibbonAxes()
    expect(ribbonAxes(ORIGIN, ORIGIN, { x: 1, y: 0, z: 0 }, axes)).toBe(0)
    expect(Number.isFinite(axes.side.x + axes.side.y + axes.side.z)).toBe(true)
  })
})
