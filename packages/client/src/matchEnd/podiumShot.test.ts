import { describe, expect, it } from 'vitest'
import { PODIUM_ALTITUDE_M, podiumCamerasOf, podiumFeetM, podiumShot } from './podiumShot.ts'

const FEET = [0, PODIUM_ALTITUDE_M, 20] as const

function distance(shot: ReturnType<typeof podiumShot>): number {
  const [ex, , ez] = shot.eyeM
  return Math.hypot(ex - FEET[0], ez - FEET[2])
}

describe('podiumFeetM', () => {
  it('no centro da área de jogo, no céu', () => {
    expect(podiumFeetM({ minX: -40, maxX: 40, minZ: -20, maxZ: 60 })).toEqual([
      0,
      PODIUM_ALTITUDE_M,
      20,
    ])
  })
})

describe('podiumShot', () => {
  it('olha o peito de cima, à frente do corpo', () => {
    const shot = podiumShot(FEET, 1.8, 0)
    expect(shot.targetM).toEqual([0, PODIUM_ALTITUDE_M + 0.99, 20])
    expect(shot.eyeM[1]).toBeGreaterThan(PODIUM_ALTITUDE_M + 1.8)
    expect(shot.eyeM[2]).toBeGreaterThan(FEET[2])
  })

  it('chega devagar até o fim da contagem, e para', () => {
    const start = distance(podiumShot(FEET, 1.8, 0))
    const middle = distance(podiumShot(FEET, 1.8, 5))
    const end = distance(podiumShot(FEET, 1.8, 10))
    expect(start).toBeCloseTo(6.2)
    expect(middle).toBeLessThan(start)
    expect(end).toBeCloseTo(4.8)
    expect(distance(podiumShot(FEET, 1.8, 30))).toBeCloseTo(4.8)
    expect(distance(podiumShot(FEET, 1.8, -1))).toBeCloseTo(6.2)
  })
})

describe('podiumCamerasOf', () => {
  it('na tela, o pódio liga e desliga as câmeras de jogo', () => {
    expect(podiumCamerasOf(true, false)).toBe('podium')
    expect(podiumCamerasOf(false, false)).toBe('play')
  })

  it('com o óculos ligado, as câmeras dele ficam', () => {
    // regressão: o fim do pódio devolvia o par mono por cima do estéreo.
    expect(podiumCamerasOf(false, true)).toBe('keep')
    expect(podiumCamerasOf(true, true)).toBe('keep')
  })
})
