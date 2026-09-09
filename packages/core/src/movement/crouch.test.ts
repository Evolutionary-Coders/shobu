import { describe, expect, it } from 'vitest'
import { boxFromCenterSize } from '../collision/staticBox.ts'
import { horizontalSpeed } from './characterState.ts'
import { CROUCH_CAPSULE_RATIO } from './crouch.ts'
import { IDLE_INPUT } from './movementInput.ts'
import {
  FLOOR,
  FORWARD,
  runTicks,
  SPRINT_FORWARD,
  shippedConfig,
  standingCharacter,
  tickDurationS,
  ticksFor,
} from './movementTestKit.ts'
import { stepCharacter } from './stepCharacter.ts'

const config = shippedConfig()
const { movement, collision } = config
const dtS = tickDurationS(config)
const CROUCH_FORWARD = { ...FORWARD, crouch: true }

describe('agachar', () => {
  it('agacha com a tecla presa e encolhe a cápsula', () => {
    const state = standingCharacter(config)
    stepCharacter(state, { ...IDLE_INPUT, crouch: true }, [FLOOR], config, dtS)
    expect(state.stance).toBe('crouching')
    expect(state.capsuleHeightM).toBeCloseTo(collision.capsuleHeightM * CROUCH_CAPSULE_RATIO)
  })

  it('agachado anda na velocidade de agachado', () => {
    const state = runTicks(standingCharacter(config), CROUCH_FORWARD, ticksFor(1, config), config)
    expect(horizontalSpeed(state)).toBeCloseTo(movement.crouchSpeedMps)
  })

  it('agachado não corre com shift', () => {
    const state = standingCharacter(config)
    stepCharacter(state, { ...IDLE_INPUT, crouch: true }, [FLOOR], config, dtS)
    runTicks(state, { ...SPRINT_FORWARD, crouch: true }, ticksFor(1, config), config)
    expect(state.sprinting).toBe(false)
    expect(horizontalSpeed(state)).toBeCloseTo(movement.crouchSpeedMps)
  })

  it('levanta ao soltar a tecla', () => {
    const state = standingCharacter(config)
    stepCharacter(state, { ...IDLE_INPUT, crouch: true }, [FLOOR], config, dtS)
    stepCharacter(state, IDLE_INPUT, [FLOOR], config, dtS)
    expect(state.stance).toBe('standing')
    expect(state.capsuleHeightM).toBe(collision.capsuleHeightM)
  })

  /**
   * A passagem baixa do modelo de simulação: entre a cápsula agachada e a em
   * pé. Levantar ali poria a cabeça dentro do teto, então o jogador fica
   * agachado até sair de baixo dele.
   */
  it('não levanta debaixo de teto baixo, e levanta ao sair de baixo dele', () => {
    // passagem de x 2 a 6 com o teto em 1,2 m: cabe agachado (1,08), não em pé (1,8)
    const lowCeiling = boxFromCenterSize([4, 1.7, 0], [4, 1, 4])
    const world = [FLOOR, lowCeiling]
    const state = standingCharacter(config, world)
    const crouchEast = { ...IDLE_INPUT, wishX: 1, crouch: true }
    runTicks(state, crouchEast, ticksFor(1, config), config, world)
    expect(state.position.x).toBeGreaterThan(2.5)
    expect(state.position.x).toBeLessThan(5.5)
    stepCharacter(state, { ...IDLE_INPUT, wishX: 1 }, world, config, dtS)
    expect(state.stance).toBe('crouching')
    runTicks(state, { ...IDLE_INPUT, wishX: 1 }, ticksFor(1.5, config), config, world)
    expect(state.stance).toBe('standing')
    expect(state.position.y).toBe(0)
  })

  /** Como no modern warfare: quem segura a tecla até o fim do slide sai agachado. */
  it('slide que termina com a tecla presa vira agachado', () => {
    const state = runTicks(standingCharacter(config), SPRINT_FORWARD, ticksFor(1, config), config)
    const slideHeld = { ...SPRINT_FORWARD, crouch: true }
    runTicks(state, slideHeld, ticksFor(movement.slideDurationS + 0.1, config), config)
    expect(state.stance).toBe('crouching')
    expect(state.capsuleHeightM).toBeCloseTo(collision.capsuleHeightM * CROUCH_CAPSULE_RATIO)
  })

  it('a câmera, e não só a cápsula, desce: o olho fica no topo da cápsula agachada', () => {
    const state = standingCharacter(config)
    stepCharacter(state, { ...IDLE_INPUT, crouch: true }, [FLOOR], config, dtS)
    expect(state.position.y + state.capsuleHeightM).toBeCloseTo(
      collision.capsuleHeightM * CROUCH_CAPSULE_RATIO,
    )
  })
})
