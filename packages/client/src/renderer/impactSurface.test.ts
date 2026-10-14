import { boxFromCenterSize } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { wallNormalAt } from './impactSurface.ts'

/** Uma parede de 1 m de espessura, com a face da frente em z = 10. */
const WALL = boxFromCenterSize([0, 2, 10.5], [20, 4, 1])
/** O piso: o topo em y = 0. */
const FLOOR = boxFromCenterSize([0, -0.5, 0], [40, 1, 40])
const BOXES = [FLOOR, WALL]

describe('wallNormalAt', () => {
  it('na parede de frente, a normal volta para o atirador', () => {
    const normal = { x: 0, y: 0, z: 0 }
    expect(wallNormalAt({ x: 1, y: 1.5, z: 10 }, { x: 0, y: 0, z: 1 }, BOXES, normal)).toBe(true)
    expect(normal).toEqual({ x: 0, y: 0, z: -1 })
  })

  it('no piso, a normal é o cima', () => {
    const normal = { x: 0, y: 0, z: 0 }
    const down = { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 }
    expect(wallNormalAt({ x: 0, y: 0, z: 3 }, down, BOXES, normal)).toBe(true)
    expect(normal).toEqual({ x: 0, y: 1, z: 0 })
  })

  it('na lateral da parede, a normal é o x', () => {
    const normal = { x: 0, y: 0, z: 0 }
    expect(wallNormalAt({ x: 10, y: 2, z: 10.5 }, { x: -1, y: 0, z: 0 }, BOXES, normal)).toBe(true)
    expect(normal).toEqual({ x: 1, y: 0, z: 0 })
  })

  it('tiro que acabou no ar não acha parede', () => {
    const normal = { x: 0, y: 0, z: 0 }
    expect(wallNormalAt({ x: 0, y: 30, z: 200 }, { x: 0, y: 0, z: 1 }, BOXES, normal)).toBe(false)
  })
})
