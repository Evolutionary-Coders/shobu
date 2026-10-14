import { describe, expect, it } from 'vitest'
import { COLLIDER_GRAPPLE_ONLY } from './colliderMask.ts'
import { type BodyReach, nearbyBodyBoxes } from './nearbyBodyBoxes.ts'
import { boxFromCenterSize } from './staticBox.ts'

const STILL: BodyReach = {
  x: 0,
  y: 0,
  z: 0,
  dx: 0,
  dy: 0,
  dz: 0,
  radiusM: 0.4,
  reachUpM: 2.2,
  reachDownM: 0.02,
}

const FLOOR = boxFromCenterSize([0, -0.5, 0], [64, 1, 64])
const FAR_WALL = boxFromCenterSize([20, 2, 0], [1, 4, 4])

describe('nearbyBodyBoxes', () => {
  it('fica com o chão embaixo e larga a parede do outro lado do mapa', () => {
    expect(nearbyBodyBoxes([FLOOR, FAR_WALL], STILL)).toEqual([FLOOR])
  })

  it('pega a parede que o deslocamento do tick alcança', () => {
    expect(nearbyBodyBoxes([FLOOR, FAR_WALL], { ...STILL, dx: 19.6 })).toEqual([FLOOR, FAR_WALL])
  })

  it('pega o teto ao alcance da cabeça e de um degrau, e larga o mais alto', () => {
    const low = boxFromCenterSize([0, 2.5, 0], [4, 0.4, 4])
    const high = boxFromCenterSize([0, 6, 0], [4, 1, 4])
    expect(nearbyBodyBoxes([low, high], STILL)).toEqual([low])
  })

  it('larga o que não para o corpo, mesmo encostado', () => {
    const lantern = boxFromCenterSize([0, 1, 0], [1, 1, 1], COLLIDER_GRAPPLE_ONLY)
    expect(nearbyBodyBoxes([lantern], STILL)).toEqual([])
  })

  it('olha para trás também: o deslocamento negativo estende o lado de menos', () => {
    const behind = boxFromCenterSize([0, 1, -10], [4, 2, 1])
    expect(nearbyBodyBoxes([behind], { ...STILL, dz: -10 })).toEqual([behind])
    expect(nearbyBodyBoxes([behind], STILL)).toEqual([])
  })
})
