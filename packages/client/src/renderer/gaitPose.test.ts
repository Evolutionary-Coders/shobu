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

  it('na corrida a sniper aponta para baixo e para a esquerda; na plena, o cano sobe', () => {
    const sprint = gaitRigPose(
      { sprint: 1, tactical: 0 },
      SNIPER_GAIT,
      STILL,
      true,
      createRigPose(),
    )
    // pitch positivo baixa o cano, guinada negativa o leva para a esquerda (`gripPivot.ts`).
    expect(sprint.pitchRad).toBeGreaterThan(0)
    expect(sprint.yawRad).toBeLessThan(0)
    const tactical = gaitRigPose(
      { sprint: 0, tactical: 1 },
      SNIPER_GAIT,
      STILL,
      true,
      createRigPose(),
    )
    expect(tactical.pitchRad).toBeLessThan(-1)
    expect(tactical.x).toBeGreaterThan(sprint.x)
  })

  it('a katana baixa a lâmina na corrida, e a põe em pé na plena', () => {
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
    expect(tactical.pitchRad).toBeLessThan(0)
  })

  it('no meio da troca, as duas poses se misturam sem somar por inteiro', () => {
    const half = gaitRigPose(
      { sprint: 0.5, tactical: 0.5 },
      SNIPER_GAIT,
      STILL,
      true,
      createRigPose(),
    )
    expect(half.pitchRad).toBeCloseTo(
      (SNIPER_GAIT.sprint.pitchRad + SNIPER_GAIT.tactical.pitchRad) / 2,
    )
    expect(half.cantRad).toBeCloseTo(
      (SNIPER_GAIT.sprint.cantRad + SNIPER_GAIT.tactical.cantRad) / 2,
    )
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
