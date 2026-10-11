import { describe, expect, it } from 'vitest'
import {
  addScaled,
  clampLength,
  cross,
  dot,
  lengthSquared,
  normalizeInPlace,
  scaleInPlace,
  type Vector3,
} from './vector3.ts'

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

describe('cross', () => {
  it('o produto vetorial de x e y é z', () => {
    const out = { x: 0, y: 0, z: 0 }
    cross(out, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })
    expect(out).toEqual({ x: 0, y: 0, z: 1 })
  })

  /** Escrever em `out` durante a conta trocaria o resultado pela entrada. */
  it('aceita o próprio destino como entrada', () => {
    const out = { x: 1, y: 0, z: 0 }
    cross(out, out, { x: 0, y: 1, z: 0 })
    expect(out).toEqual({ x: 0, y: 0, z: 1 })
  })

  it('o produto vetorial de um vetor com ele mesmo é nulo', () => {
    const out = { x: 0, y: 0, z: 0 }
    cross(out, { x: 2, y: -3, z: 5 }, { x: 2, y: -3, z: 5 })
    expect(out).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('dot', () => {
  it('vetores perpendiculares dão zero', () => {
    expect(dot({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBe(0)
  })

  it('o produto escalar de um unitário com ele mesmo é um', () => {
    expect(dot({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 })).toBe(1)
  })
})

describe('normalizeInPlace', () => {
  it('preserva a direção e devolve comprimento 1', () => {
    const out = { x: 0, y: 3, z: 4 }
    normalizeInPlace(out)
    expect(lengthSquared(out)).toBeCloseTo(1)
    expect(out.y / out.z).toBeCloseTo(3 / 4)
  })

  /** `NaN` num vetor de direção contamina todo o tick seguinte, em silêncio. */
  it('vetor nulo fica como está, em vez de virar NaN', () => {
    const out = { x: 0, y: 0, z: 0 }
    normalizeInPlace(out)
    expect(out).toEqual({ x: 0, y: 0, z: 0 })
  })
})
