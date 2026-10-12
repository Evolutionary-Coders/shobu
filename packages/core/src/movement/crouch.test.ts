import { describe, expect, it } from 'vitest'
import { boxFromCenterSize } from '../collision/staticBox.ts'
import { horizontalSpeed, respawnCharacter } from './characterState.ts'
import { CROUCH_CAPSULE_RATIO, updateCrouchToggle } from './crouch.ts'
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
const TAP_CROUCH = { ...IDLE_INPUT, crouch: true }

/** Um toque na tecla: desce num tick, sobe no seguinte. */
function tapCrouch(state: ReturnType<typeof standingCharacter>, boxes = [FLOOR]): void {
  stepCharacter(state, TAP_CROUCH, boxes, config, dtS)
  stepCharacter(state, IDLE_INPUT, boxes, config, dtS)
}

describe('agachar', () => {
  it('agacha no aperto e encolhe a cápsula', () => {
    const state = standingCharacter(config)
    stepCharacter(state, TAP_CROUCH, [FLOOR], config, dtS)
    expect(state.stance).toBe('crouching')
    expect(state.capsuleHeightM).toBeCloseTo(collision.capsuleHeightM * CROUCH_CAPSULE_RATIO)
  })

  it('agachado anda na velocidade de agachado', () => {
    const state = runTicks(standingCharacter(config), CROUCH_FORWARD, ticksFor(1, config), config)
    expect(horizontalSpeed(state)).toBeCloseTo(movement.crouchSpeedMps)
  })

  it('soltar a tecla não levanta: agachar é alternado', () => {
    const state = standingCharacter(config)
    tapCrouch(state)
    runTicks(state, IDLE_INPUT, ticksFor(0.5, config), config)
    expect(state.stance).toBe('crouching')
  })

  it('o segundo aperto levanta', () => {
    const state = standingCharacter(config)
    tapCrouch(state)
    tapCrouch(state)
    expect(state.stance).toBe('standing')
    expect(state.capsuleHeightM).toBe(collision.capsuleHeightM)
  })

  it('a tecla presa não realterna: só a descida conta', () => {
    const state = standingCharacter(config)
    runTicks(state, TAP_CROUCH, ticksFor(1, config), config)
    expect(state.stance).toBe('crouching')
    expect(state.crouchToggled).toBe(true)
  })

  /** Como no call of duty: o aperto do shift levanta, e o shift preso corre em seguida. */
  it('apertar o shift agachado levanta e corre', () => {
    const state = standingCharacter(config)
    tapCrouch(state)
    runTicks(state, SPRINT_FORWARD, ticksFor(1, config), config)
    expect(state.stance).toBe('standing')
    expect(state.sprinting).toBe(true)
    expect(horizontalSpeed(state)).toBeCloseTo(movement.sprintSpeedMps)
  })

  it('agachar com o shift já preso fica agachado: só a descida do shift levanta', () => {
    const state = runTicks(standingCharacter(config), FORWARD, ticksFor(0.3, config), config)
    stepCharacter(state, { ...FORWARD, sprint: true, crouch: true }, [FLOOR], config, dtS)
    runTicks(state, SPRINT_FORWARD, ticksFor(1, config), config)
    expect(state.stance).toBe('crouching')
    expect(state.sprinting).toBe(false)
    expect(horizontalSpeed(state)).toBeCloseTo(movement.crouchSpeedMps)
  })

  it('pular agachado levanta e pula', () => {
    const state = standingCharacter(config)
    tapCrouch(state)
    stepCharacter(state, { ...IDLE_INPUT, jump: true }, [FLOOR], config, dtS)
    expect(state.stance).toBe('standing')
    expect(state.grounded).toBe(false)
    expect(state.crouchToggled).toBe(false)
  })

  it('o pedido feito no ar agacha ao pousar', () => {
    const state = standingCharacter(config)
    stepCharacter(state, { ...IDLE_INPUT, jump: true }, [FLOOR], config, dtS)
    stepCharacter(state, TAP_CROUCH, [FLOOR], config, dtS)
    expect(state.stance).toBe('standing')
    runTicks(state, IDLE_INPUT, ticksFor(1.5, config), config)
    expect(state.stance).toBe('crouching')
  })

  /** A morte não leva o agachar para a vida seguinte: o respawn nasce de pé. */
  it('o respawn apaga o pedido, embora preserve a tecla presa', () => {
    const state = standingCharacter(config)
    stepCharacter(state, TAP_CROUCH, [FLOOR], config, dtS)
    respawnCharacter(state, { x: 4, y: 0, z: 4 }, config)
    expect(state.crouchToggled).toBe(false)
    expect(state.crouchWasHeld).toBe(true)
    runTicks(state, TAP_CROUCH, ticksFor(0.3, config), config)
    expect(state.stance).toBe('standing')
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
    stepCharacter(state, crouchEast, world, config, dtS)
    expect(state.crouchToggled).toBe(false)
    expect(state.stance).toBe('crouching')
    runTicks(state, { ...IDLE_INPUT, wishX: 1 }, ticksFor(1.5, config), config, world)
    expect(state.stance).toBe('standing')
    expect(state.position.y).toBe(0)
  })

  /** Como no modern warfare: quem segura a tecla até o fim do slide sai agachado. */
  it('slide que termina com a tecla presa vira agachado, e o próximo aperto levanta', () => {
    const state = runTicks(standingCharacter(config), SPRINT_FORWARD, ticksFor(1, config), config)
    const slideHeld = { ...SPRINT_FORWARD, crouch: true }
    runTicks(state, slideHeld, ticksFor(movement.slideDurationS + 0.1, config), config)
    expect(state.stance).toBe('crouching')
    expect(state.capsuleHeightM).toBeCloseTo(collision.capsuleHeightM * CROUCH_CAPSULE_RATIO)
    stepCharacter(state, FORWARD, [FLOOR], config, dtS)
    tapCrouch(state)
    expect(state.stance).toBe('standing')
  })

  /** O toque que começa o slide é do slide: soltar e deixar acabar sai de pé. */
  it('slide tocado e solto termina de pé, sem pedido de agachar', () => {
    const state = runTicks(standingCharacter(config), SPRINT_FORWARD, ticksFor(1, config), config)
    stepCharacter(state, { ...SPRINT_FORWARD, crouch: true }, [FLOOR], config, dtS)
    expect(state.stance).toBe('sliding')
    runTicks(state, SPRINT_FORWARD, ticksFor(movement.slideDurationS + 0.1, config), config)
    expect(state.stance).toBe('standing')
    expect(state.crouchToggled).toBe(false)
  })

  it('a câmera, e não só a cápsula, desce: o olho fica no topo da cápsula agachada', () => {
    const state = standingCharacter(config)
    stepCharacter(state, TAP_CROUCH, [FLOOR], config, dtS)
    expect(state.position.y + state.capsuleHeightM).toBeCloseTo(
      collision.capsuleHeightM * CROUCH_CAPSULE_RATIO,
    )
  })
})

describe('updateCrouchToggle', () => {
  const NO_EDGES = { crouchPressed: false, sprintPressed: false, jumpPressed: false }

  it('a descida alterna, e nada mais muda o pedido sozinho', () => {
    const state = standingCharacter(config)
    updateCrouchToggle(state, { ...NO_EDGES, crouchPressed: true })
    updateCrouchToggle(state, NO_EDGES)
    expect(state.crouchToggled).toBe(true)
    updateCrouchToggle(state, { ...NO_EDGES, crouchPressed: true })
    expect(state.crouchToggled).toBe(false)
  })

  it('o shift e o pulo apagam o pedido', () => {
    const state = standingCharacter(config)
    for (const edge of ['sprintPressed', 'jumpPressed'] as const) {
      state.crouchToggled = true
      updateCrouchToggle(state, { ...NO_EDGES, [edge]: true })
      expect(state.crouchToggled, edge).toBe(false)
    }
  })
})
