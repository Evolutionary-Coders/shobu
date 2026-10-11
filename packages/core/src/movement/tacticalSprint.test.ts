import { describe, expect, it } from 'vitest'
import { horizontalSpeed } from './characterState.ts'
import { IDLE_INPUT } from './movementInput.ts'
import {
  FORWARD,
  runTicks,
  SPRINT_FORWARD,
  shippedConfig,
  standingCharacter,
  ticksFor,
} from './movementTestKit.ts'
import { tacticalTankRatio } from './tacticalSprint.ts'

const config = shippedConfig()
const { movement } = config

/** Correndo, solta o shift por um tick e aperta de novo: o shift duplo. */
function doubleTapSprint() {
  const state = runTicks(standingCharacter(config), SPRINT_FORWARD, ticksFor(0.1, config), config)
  runTicks(state, FORWARD, 1, config)
  return runTicks(state, SPRINT_FORWARD, 1, config)
}

describe('corrida tática plena', () => {
  it('o shift duplo correndo liga a corrida plena', () => {
    expect(doubleTapSprint().tacticalSprinting).toBe(true)
  })

  it('corre na velocidade da corrida plena, acima da corrida tática', () => {
    const state = runTicks(doubleTapSprint(), SPRINT_FORWARD, ticksFor(0.5, config), config)
    expect(horizontalSpeed(state)).toBeCloseTo(movement.tacticalSprintSpeedMps)
    expect(movement.tacticalSprintSpeedMps).toBeGreaterThan(movement.sprintSpeedMps)
  })

  it('um aperto só é a corrida comum', () => {
    const state = runTicks(standingCharacter(config), SPRINT_FORWARD, ticksFor(0.5, config), config)
    expect([state.sprinting, state.tacticalSprinting]).toEqual([true, false])
  })

  it('o segundo aperto fora da janela não liga a corrida plena', () => {
    const state = runTicks(standingCharacter(config), SPRINT_FORWARD, 2, config)
    runTicks(state, FORWARD, ticksFor(movement.sprintDoubleTapS + 0.1, config), config)
    runTicks(state, SPRINT_FORWARD, 1, config)
    expect(state.tacticalSprinting).toBe(false)
  })

  it('o tanque esvazia e a corrida cai para a comum sem soltar a tecla', () => {
    const state = doubleTapSprint()
    runTicks(state, SPRINT_FORWARD, ticksFor(movement.tacticalSprintTankS + 0.1, config), config)
    expect([state.sprinting, state.tacticalSprinting, state.tacticalTankS]).toEqual([
      true,
      false,
      0,
    ])
    runTicks(state, SPRINT_FORWARD, ticksFor(0.3, config), config)
    expect(horizontalSpeed(state)).toBeCloseTo(movement.sprintSpeedMps)
  })

  it('parar derruba a corrida plena', () => {
    const state = runTicks(doubleTapSprint(), IDLE_INPUT, 1, config)
    expect(state.tacticalSprinting).toBe(false)
  })

  it('o tanque espera antes de encher, e então enche até o cheio', () => {
    const state = doubleTapSprint()
    runTicks(state, SPRINT_FORWARD, ticksFor(1, config), config)
    const spent = state.tacticalTankS
    runTicks(
      state,
      IDLE_INPUT,
      ticksFor(movement.tacticalSprintRechargeDelayS - 0.1, config),
      config,
    )
    expect(state.tacticalTankS).toBe(spent)
    runTicks(state, IDLE_INPUT, ticksFor(movement.tacticalSprintRefillS + 0.5, config), config)
    expect(tacticalTankRatio(state, config)).toBe(1)
  })

  it('com o tanque vazio o shift duplo não liga nada', () => {
    const state = doubleTapSprint()
    runTicks(state, SPRINT_FORWARD, ticksFor(movement.tacticalSprintTankS + 0.1, config), config)
    runTicks(state, FORWARD, 1, config)
    runTicks(state, SPRINT_FORWARD, 1, config)
    expect(state.tacticalSprinting).toBe(false)
  })
})
