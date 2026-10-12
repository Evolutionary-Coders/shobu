import { describe, expect, it } from 'vitest'
import { matchViewmodelProjection } from './viewmodelProjection.ts'

const DEG = Math.PI / 180

/** A coordenada de tela (em meia-altura) de um ponto do espaço da câmera, com fov vertical. */
function screenY(point: { y: number; z: number }, fovRad: number): number {
  return point.y / (point.z * Math.tan(fovRad / 2))
}

describe('matchViewmodelProjection', () => {
  it('a câmera do mundo desenha o ponto no pixel em que a da arma o desenhava', () => {
    const muzzle = { x: 0.2, y: -0.15, z: 1 }
    const before = screenY(muzzle, 40 * DEG)
    matchViewmodelProjection(muzzle, 40 * DEG, 70 * DEG)
    expect(screenY(muzzle, 70 * DEG)).toBeCloseTo(before)
  })

  it('mantém a profundidade', () => {
    expect(matchViewmodelProjection({ x: 1, y: 1, z: 3 }, 40 * DEG, 70 * DEG).z).toBe(3)
  })

  it('com o mesmo fov, não mexe', () => {
    expect(matchViewmodelProjection({ x: 1, y: 2, z: 3 }, 50 * DEG, 50 * DEG)).toEqual({
      x: 1,
      y: 2,
      z: 3,
    })
  })

  it('recusa fov fora de (0, π)', () => {
    const point = { x: 0, y: 0, z: 1 }
    expect(() => matchViewmodelProjection(point, 0, 1)).toThrow(/viewmodelFovRad recebeu 0/)
    expect(() => matchViewmodelProjection(point, 1, Math.PI)).toThrow(/worldFovRad/)
  })
})
