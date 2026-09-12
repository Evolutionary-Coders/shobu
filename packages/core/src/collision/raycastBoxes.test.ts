import { describe, expect, it } from 'vitest'
import { raycastBoxes } from './raycastBoxes.ts'
import { boxFromCenterSize } from './staticBox.ts'

/** Parede de 1 m de espessura com a face sul em z = 5. */
const WALL = boxFromCenterSize([0, 5, 5.5], [20, 10, 1])
const FLOOR = boxFromCenterSize([0, -0.5, 0], [64, 1, 64])

describe('raycastBoxes', () => {
  it('devolve a distância até a primeira face na frente do raio', () => {
    expect(raycastBoxes({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, [FLOOR, WALL], 50)).toBe(5)
  })

  it('é undefined quando nada está dentro do alcance', () => {
    expect(
      raycastBoxes({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, [FLOOR, WALL], 4),
    ).toBeUndefined()
  })

  it('ignora caixa atrás do raio', () => {
    expect(raycastBoxes({ x: 0, y: 1, z: 8 }, { x: 0, y: 0, z: 1 }, [WALL], 50)).toBeUndefined()
  })

  it('ignora caixa fora da linha do raio', () => {
    expect(raycastBoxes({ x: 30, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, [WALL], 50)).toBeUndefined()
  })

  it('escolhe a caixa mais perto entre várias', () => {
    const near = boxFromCenterSize([0, 1, 2.5], [1, 2, 1])
    expect(raycastBoxes({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, [WALL, near], 50)).toBe(2)
  })

  it('raio inclinado acerta o chão na distância certa', () => {
    // 45° para baixo a partir de 1 m de altura: toca y = 0 a sqrt(2) m
    const down = Math.SQRT1_2
    const hit = raycastBoxes({ x: 0, y: 1, z: 0 }, { x: 0, y: -down, z: down }, [FLOOR], 50)
    expect(hit).toBeCloseTo(Math.SQRT2)
  })

  it('origem dentro da caixa conta como zero', () => {
    expect(raycastBoxes({ x: 0, y: 5, z: 5.5 }, { x: 1, y: 0, z: 0 }, [WALL], 50)).toBe(0)
  })

  it('recusa alcance que não avança', () => {
    expect(() => raycastBoxes({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, [WALL], 0)).toThrow(
      /maxDistanceM recebeu 0/,
    )
  })
})
