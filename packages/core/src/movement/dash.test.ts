import { describe, expect, it } from 'vitest'
import { horizontalSpeed } from './characterState.ts'
import { IDLE_INPUT, type MovementInput } from './movementInput.ts'
import {
  FLOOR,
  runTicks,
  shippedConfig,
  standingCharacter,
  tickDurationS,
  ticksFor,
} from './movementTestKit.ts'
import { stepCharacter } from './stepCharacter.ts'

const config = shippedConfig()
const dtS = tickDurationS(config)
const DASH_EAST: MovementInput = { ...IDLE_INPUT, dash: true, aimX: 2, aimY: 0.5 }

describe('investida da katana', () => {
  it('no chão, lança na direção da mira, no plano do chão', () => {
    const state = standingCharacter(config)
    stepCharacter(state, DASH_EAST, [FLOOR], config, dtS)
    expect(state.velocity.x).toBeGreaterThan(config.movement.sprintSpeedMps)
    expect(state.velocity.z).toBeCloseTo(0)
  })

  it('é curta: o atrito do chão a desfaz em menos de meio segundo', () => {
    const state = standingCharacter(config)
    stepCharacter(state, DASH_EAST, [FLOOR], config, dtS)
    runTicks(state, IDLE_INPUT, ticksFor(0.5, config), config)
    expect(horizontalSpeed(state)).toBe(0)
    expect(state.position.x).toBeGreaterThan(1)
    expect(state.position.x).toBeLessThan(4)
  })

  it('no ar não investe', () => {
    const state = standingCharacter(config)
    state.grounded = false
    stepCharacter(state, DASH_EAST, [], config, dtS)
    expect(state.velocity.x).toBe(0)
  })

  it('agachado não investe', () => {
    const state = runTicks(standingCharacter(config), { ...IDLE_INPUT, crouch: true }, 2, config)
    stepCharacter(state, { ...DASH_EAST, crouch: true }, [FLOOR], config, dtS)
    expect(state.velocity.x).toBe(0)
  })

  it('com a mira na vertical não há direção, e não investe', () => {
    const state = standingCharacter(config)
    stepCharacter(state, { ...IDLE_INPUT, dash: true, aimY: 1 }, [FLOOR], config, dtS)
    expect(horizontalSpeed(state)).toBe(0)
  })
})
