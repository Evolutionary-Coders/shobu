import { describe, expect, it } from 'vitest'
import {
  advanceGaitBlend,
  createGaitBlend,
  GAIT_BLEND_S,
  gaitOf,
  gaitRigPose,
  KATANA_GAIT,
  SNIPER_GAIT,
} from './gaitPose.ts'
import { createRigPose } from './rigPose.ts'

const STILL = { phase: 0, amplitude: 0 }

describe('gaitOf', () => {
  it('lê a passada do corpo do núcleo', () => {
    expect(gaitOf({ sprinting: false, tacticalSprinting: false })).toBe('walk')
    expect(gaitOf({ sprinting: true, tacticalSprinting: false })).toBe('sprint')
    expect(gaitOf({ sprinting: true, tacticalSprinting: true })).toBe('tactical')
  })
})

describe('advanceGaitBlend', () => {
  it('entra na pose em GAIT_BLEND_S e para no inteiro', () => {
    const blend = createGaitBlend()
    advanceGaitBlend(blend, 'sprint', GAIT_BLEND_S / 2)
    expect(blend.sprint).toBeCloseTo(0.5)
    advanceGaitBlend(blend, 'sprint', GAIT_BLEND_S)
    expect(blend.sprint).toBe(1)
  })

  it('trocar para a corrida plena tira uma pose enquanto põe a outra', () => {
    const blend = { sprint: 1, tactical: 0 }
    advanceGaitBlend(blend, 'tactical', GAIT_BLEND_S / 2)
    expect(blend.sprint).toBeCloseTo(0.5)
    expect(blend.tactical).toBeCloseTo(0.5)
    advanceGaitBlend(blend, 'walk', GAIT_BLEND_S)
    expect(blend).toEqual({ sprint: 0, tactical: 0 })
  })
})

describe('gaitRigPose', () => {
  it('andando, a arma fica onde está', () => {
    expect(gaitRigPose(createGaitBlend(), SNIPER_GAIT, STILL, true, createRigPose())).toEqual(
      createRigPose(),
    )
  })

  it('na corrida a sniper desce cruzando o peito; na plena, sobe com o cano para cima', () => {
    const sprint = gaitRigPose(
      { sprint: 1, tactical: 0 },
      SNIPER_GAIT,
      STILL,
      true,
      createRigPose(),
    )
    expect(sprint.y).toBeLessThan(0)
    expect(sprint.pitchRad).toBeGreaterThan(0)
    expect(sprint.yawRad).toBeLessThan(0)
    const tactical = gaitRigPose(
      { sprint: 0, tactical: 1 },
      SNIPER_GAIT,
      STILL,
      true,
      createRigPose(),
    )
    // o pivô da sniper fica na frente dela: girar mais é erguer a arma no ombro.
    expect(tactical.pitchRad).toBeGreaterThan(sprint.pitchRad)
    expect(tactical.x).toBeGreaterThan(sprint.x)
  })

  it('a katana baixa a lâmina na corrida, e a leva mais para trás na plena', () => {
    const sprint = gaitRigPose(
      { sprint: 1, tactical: 0 },
      KATANA_GAIT,
      STILL,
      true,
      createRigPose(),
    )
    const tactical = gaitRigPose(
      { sprint: 0, tactical: 1 },
      KATANA_GAIT,
      STILL,
      true,
      createRigPose(),
    )
    expect(sprint.pitchRad).toBeGreaterThan(0)
    expect(tactical.pitchRad).toBeGreaterThan(sprint.pitchRad)
    expect(tactical.yawRad).toBeLessThan(sprint.yawRad)
  })

  it('a passada sacode mais na corrida plena, e nada para quem pediu menos movimento', () => {
    const stride = { phase: Math.PI / 2, amplitude: 1 }
    const rest = gaitRigPose({ sprint: 0, tactical: 1 }, SNIPER_GAIT, STILL, true, createRigPose())
    const shaken = gaitRigPose(
      { sprint: 0, tactical: 1 },
      SNIPER_GAIT,
      stride,
      true,
      createRigPose(),
    )
    const calm = gaitRigPose(
      { sprint: 0, tactical: 1 },
      SNIPER_GAIT,
      stride,
      false,
      createRigPose(),
    )
    expect(shaken.x).toBeGreaterThan(rest.x)
    expect(calm).toEqual(rest)
    const sprintShake = gaitRigPose(
      { sprint: 1, tactical: 0 },
      SNIPER_GAIT,
      stride,
      true,
      createRigPose(),
    )
    const sprintRest = gaitRigPose(
      { sprint: 1, tactical: 0 },
      SNIPER_GAIT,
      STILL,
      true,
      createRigPose(),
    )
    expect(shaken.x - rest.x).toBeGreaterThan(sprintShake.x - sprintRest.x)
  })
})
