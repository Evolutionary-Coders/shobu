import { createMeleeState } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { GAIT_BLEND_S } from './gaitPose.ts'
import { REST_POSE } from './rigPose.ts'
import { createViewmodelStage, stageViewmodels } from './viewmodelStage.ts'

const STILL = { phase: 0, amplitude: 0 }
const SPRINT = { sprinting: true, tacticalSprinting: false }
const WALK = { sprinting: false, tacticalSprinting: false }

describe('stageViewmodels', () => {
  it('correndo com a sniper, ela abaixa; a lâmina guardada não corre', () => {
    const stage = createViewmodelStage()
    const cue = { melee: createMeleeState('katana'), body: SPRINT, stride: STILL, motion: true }
    stageViewmodels(stage, cue, GAIT_BLEND_S)
    expect(stage.sniperPose.y).toBeLessThan(0)
    expect(stage.bladePose).toEqual(REST_POSE)
  })

  it('com a katana na mão, a corrida mexe na lâmina', () => {
    const stage = createViewmodelStage()
    const melee = createMeleeState('katana')
    melee.bladeDrawn = true
    stageViewmodels(stage, { melee, body: SPRINT, stride: STILL, motion: true }, 1)
    expect(stage.shot.bladeVisible).toBe(true)
    expect(stage.bladePose).not.toEqual(REST_POSE)
  })

  it('o golpe rápido afunda a sniper por cima da passada e rola a câmera no corte', () => {
    const stage = createViewmodelStage()
    const melee = createMeleeState('knife')
    melee.strikes = 1
    stageViewmodels(stage, { melee, body: WALK, stride: STILL, motion: true }, 0.12)
    expect(stage.sniperPose.y).toBeLessThan(0)
    expect(stage.shot.weapon).toBe('knife')
    expect(stage.shot.cameraRollRad).not.toBe(0)
  })

  it('quem pediu menos movimento não ganha rolagem de câmera', () => {
    const stage = createViewmodelStage()
    const melee = createMeleeState('katana')
    melee.strikes = 1
    stageViewmodels(stage, { melee, body: WALK, stride: STILL, motion: false }, 0.12)
    expect(stage.shot.cameraRollRad).toBe(0)
  })
})
