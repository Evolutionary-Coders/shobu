import { describe, expect, it } from 'vitest'
import { DECAL_LIFT_M, DECAL_MATRIX_FLOATS, hideDecal, writeDecalMatrix } from './decalMatrix.ts'

function row(buffer: Float32Array, index: number, rowIndex: number): number[] {
  const at = index * DECAL_MATRIX_FLOATS + rowIndex * 4
  return Array.from(buffer.slice(at, at + 3))
}

const length = (vector: number[]) => Math.hypot(...vector)
const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * (b[i] ?? 0), 0)

describe('writeDecalMatrix', () => {
  it('deita o quad na parede: o z da matriz é a normal', () => {
    const buffer = new Float32Array(DECAL_MATRIX_FLOATS * 2)
    writeDecalMatrix(buffer, 1, { x: 0, y: 1, z: 10 }, { x: 0, y: 0, z: -1 }, 0, 0.2)
    expect(row(buffer, 1, 2)).toEqual([0, 0, -1])
    expect(dot(row(buffer, 1, 0), [0, 0, -1])).toBeCloseTo(0)
    expect(dot(row(buffer, 1, 1), [0, 0, -1])).toBeCloseTo(0)
  })

  it('o lado do quad é o tamanho pedido, em qualquer giro', () => {
    const buffer = new Float32Array(DECAL_MATRIX_FLOATS)
    writeDecalMatrix(buffer, 0, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 1.2, 0.15)
    expect(length(row(buffer, 0, 0))).toBeCloseTo(0.15)
    expect(length(row(buffer, 0, 1))).toBeCloseTo(0.15)
    expect(dot(row(buffer, 0, 0), row(buffer, 0, 1))).toBeCloseTo(0)
  })

  it('no piso, o quad deita no plano xz', () => {
    const buffer = new Float32Array(DECAL_MATRIX_FLOATS)
    writeDecalMatrix(buffer, 0, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0, 1)
    expect(row(buffer, 0, 0)[1]).toBeCloseTo(0)
    expect(row(buffer, 0, 1)[1]).toBeCloseTo(0)
  })

  it('ergue o furo da parede pela normal', () => {
    const buffer = new Float32Array(DECAL_MATRIX_FLOATS)
    writeDecalMatrix(buffer, 0, { x: 2, y: 1, z: 10 }, { x: 0, y: 0, z: -1 }, 0, 0.2)
    expect(Array.from(buffer.slice(12, 16))).toEqual([2, 1, Math.fround(10 - DECAL_LIFT_M), 1])
  })
})

describe('hideDecal', () => {
  it('zera só a matriz do furo pedido', () => {
    const buffer = new Float32Array(DECAL_MATRIX_FLOATS * 2).fill(1)
    hideDecal(buffer, 1)
    expect(buffer[0]).toBe(1)
    expect(buffer.slice(DECAL_MATRIX_FLOATS).every((value) => value === 0)).toBe(true)
  })
})
