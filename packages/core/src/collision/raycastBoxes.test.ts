import { describe, expect, it } from 'vitest'
import { createBoxHit, nearestBoxHit, raycastBoxes } from './raycastBoxes.ts'
import { boxFromCenterSize } from './staticBox.ts'

const ORIGIN = { x: 0, y: 0, z: 0 }
const FORWARD = { x: 0, y: 0, z: 1 }

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

describe('nearestBoxHit', () => {
  const hit = createBoxHit()

  it('diz qual caixa foi atingida, não só a que distância', () => {
    const boxes = [
      boxFromCenterSize([0, 0, 20], [2, 2, 2]),
      boxFromCenterSize([0, 0, 10], [2, 2, 2]),
    ]
    expect(nearestBoxHit(ORIGIN, FORWARD, boxes, 50, hit)).toBe(true)
    expect(hit.index).toBe(1)
    expect(hit.distanceM).toBeCloseTo(9)
  })

  it('deixa o índice em -1 quando nada é atingido', () => {
    expect(nearestBoxHit(ORIGIN, FORWARD, [], 50, hit)).toBe(false)
    expect(hit.index).toBe(-1)
  })

  /** Sem isto o embrulho e o irmão poderiam divergir sem ninguém notar. */
  it('concorda com raycastBoxes em distância', () => {
    const boxes = [
      boxFromCenterSize([0, 0, 30], [4, 4, 4]),
      boxFromCenterSize([0, 0, 12], [4, 4, 4]),
      boxFromCenterSize([9, 0, 12], [4, 4, 4]),
    ]
    const wrapped = raycastBoxes(ORIGIN, FORWARD, boxes, 50)
    expect(nearestBoxHit(ORIGIN, FORWARD, boxes, 50, hit)).toBe(true)
    expect(hit.distanceM).toBe(wrapped)
  })

  it('recusa alcance que não avança', () => {
    expect(() => nearestBoxHit(ORIGIN, FORWARD, [], 0, hit)).toThrow(/maxDistanceM recebeu 0/)
  })
})
