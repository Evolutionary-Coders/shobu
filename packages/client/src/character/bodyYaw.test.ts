import { describe, expect, it } from 'vitest'
import { bodyYawTargetRad, followBodyYawRad, MAX_BODY_YAW_RAD } from './bodyYaw.ts'
import type { LocomotionPose } from './thirdPersonClips.ts'

const standing = (over: Partial<LocomotionPose>): LocomotionPose => ({
  stance: 'standing',
  grounded: true,
  horizontalSpeedMps: 5,
  ahead: 0,
  side: 0,
  ...over,
})

describe('bodyYawTargetRad', () => {
  it('parado ou indo reto, o corpo não gira', () => {
    expect(bodyYawTargetRad(standing({}))).toBe(0)
    expect(bodyYawTargetRad(standing({ ahead: 1 }))).toBe(0)
  })

  it('strafe puro gira até o teto, e para cada lado', () => {
    expect(bodyYawTargetRad(standing({ side: 1 }))).toBeCloseTo(MAX_BODY_YAW_RAD)
    expect(bodyYawTargetRad(standing({ side: -1 }))).toBeCloseTo(-MAX_BODY_YAW_RAD)
  })

  it('a diagonal gira menos que o strafe puro', () => {
    const diagonal = bodyYawTargetRad(standing({ ahead: 1, side: 1 }))
    expect(diagonal).toBeGreaterThan(0)
    expect(diagonal).toBeLessThan(MAX_BODY_YAW_RAD)
  })

  /**
   * Andar para trás toca a corrida ao contrário, então os pés já vão para trás:
   * o corpo inclina para o mesmo lado do strafe, não 135° para o outro.
   */
  it('recuar na diagonal inclina para o mesmo lado que avançar', () => {
    expect(bodyYawTargetRad(standing({ ahead: -1, side: 1 }))).toBeCloseTo(
      bodyYawTargetRad(standing({ ahead: 1, side: 1 })),
    )
  })

  it('o giro nunca passa do teto, para o tronco não virar de costas para a mira', () => {
    for (const ahead of [-1, 0, 1] as const) {
      for (const side of [-1, 0, 1] as const) {
        expect(Math.abs(bodyYawTargetRad(standing({ ahead, side })))).toBeLessThanOrEqual(
          MAX_BODY_YAW_RAD + 1e-9,
        )
      }
    }
  })
})

describe('followBodyYawRad', () => {
  /** Saltar 40° no quadro da tecla lê pior do que não girar. */
  it('persegue o alvo em vez de saltar nele', () => {
    const afterOneFrame = followBodyYawRad(0, MAX_BODY_YAW_RAD, 1 / 60)
    expect(afterOneFrame).toBeGreaterThan(0)
    expect(afterOneFrame).toBeLessThan(MAX_BODY_YAW_RAD / 2)
  })

  it('chega ao alvo em algumas frações de segundo', () => {
    let yaw = 0
    for (let frame = 0; frame < 60; frame += 1) {
      yaw = followBodyYawRad(yaw, MAX_BODY_YAW_RAD, 1 / 60)
    }
    expect(yaw).toBeCloseTo(MAX_BODY_YAW_RAD, 2)
  })

  it('volta ao centro quando o alvo volta a zero', () => {
    let yaw = MAX_BODY_YAW_RAD
    for (let frame = 0; frame < 60; frame += 1) yaw = followBodyYawRad(yaw, 0, 1 / 60)
    expect(yaw).toBeCloseTo(0, 2)
  })

  it('recusa tempo de quadro que anda para trás', () => {
    expect(() => followBodyYawRad(0, 1, -1)).toThrow(/dtS recebeu -1/)
  })
})
