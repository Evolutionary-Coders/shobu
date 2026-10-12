import { createMeleeState } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { BLADE_GUARDS } from './bladeGestures.ts'
import { GAIT_BLEND_S } from './gaitPose.ts'
import { createViewmodelStage, stageViewmodels } from './viewmodelStage.ts'

const STILL = { phase: 0, amplitude: 0 }
const SPRINT = { sprinting: true, tacticalSprinting: false }

describe('stageViewmodels', () => {
  it('correndo com a sniper, ela abaixa; a lâmina guardada não corre', () => {
    const stage = createViewmodelStage()
    const cue = { melee: createMeleeState('katana'), body: SPRINT, stride: STILL, motion: true }
    stageViewmodels(stage, cue, GAIT_BLEND_S)
    expect(stage.sniperPose.y).toBeLessThan(0)
    expect(stage.bladePose.pitchRad).toBe(BLADE_GUARDS.katana.pitchRad)
  })

  it('com a katana na mão, a corrida baixa a lâmina', () => {
    const stage = createViewmodelStage()
    const melee = createMeleeState('katana')
    melee.bladeDrawn = true
    stageViewmodels(stage, { melee, body: SPRINT, stride: STILL, motion: true }, 1)
    expect(stage.shot.bladeVisible).toBe(true)
    expect(stage.bladePose.pitchRad).toBeGreaterThan(BLADE_GUARDS.katana.pitchRad)
  })

  it('o golpe rápido afunda a sniper por cima da passada', () => {
    const stage = createViewmodelStage()
    const melee = createMeleeState('knife')
    melee.strikes = 1
    const body = { sprinting: false, tacticalSprinting: false }
    stageViewmodels(stage, { melee, body, stride: STILL, motion: true }, 0.1)
    expect(stage.sniperPose.y).toBeLessThan(0)
    expect(stage.shot.weapon).toBe('knife')
    // o golpe rápido não passa pela guarda: a lâmina é só o gesto.
    expect(stage.bladePose).toEqual(stage.shot.bladePose)
  })
})
