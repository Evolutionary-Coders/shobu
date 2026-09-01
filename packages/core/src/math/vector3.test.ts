import { describe, expect, it } from 'vitest'
import { addScaled, clampLength, lengthSquared, scaleInPlace, type Vector3 } from './vector3.ts'

const at = (x: number, y: number, z: number): Vector3 => ({ x, y, z })

describe('addScaled', () => {
  it('soma a direção escalada e devolve o mesmo objeto, sem alocar', () => {
    const velocity = at(1, 0, 0)
    const result = addScaled(velocity, at(0, -1, 0), 2)
    expect(result).toBe(velocity)
    expect(velocity).toEqual(at(1, -2, 0))
  })
})

describe('scaleInPlace', () => {
  it('multiplica as três componentes', () => {
    expect(scaleInPlace(at(1, 2, 3), -2)).toEqual(at(-2, -4, -6))
  })
})

describe('lengthSquared', () => {
  it('evita a raiz quando só a comparação importa', () => {
    expect(lengthSquared(at(3, 4, 0))).toBe(25)
  })
})

describe('clampLength', () => {
  it('preserva vetor mais curto que o teto', () => {
    expect(clampLength(at(3, 4, 0), 10)).toEqual(at(3, 4, 0))
  })

  it('encurta para o teto preservando a direção', () => {
    const clamped = clampLength(at(30, 40, 0), 5)
    expect(clamped.x).toBeCloseTo(3)
    expect(clamped.y).toBeCloseTo(4)
    expect(lengthSquared(clamped)).toBeCloseTo(25)
  })

  it('rejeita teto negativo citando o valor', () => {
    expect(() => clampLength(at(1, 0, 0), -1)).toThrow(/-1/)
  })
})
