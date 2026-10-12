import { describe, expect, it } from 'vitest'
import { boxFromCenterSize, type StaticBox } from '../collision/staticBox.ts'
import type { Vector3 } from '../math/vector3.ts'
import { type CharacterState, createCharacterState, horizontalSpeed } from './characterState.ts'
import { findGrappleAnchor, grappleEyeM, pullOnRope, takeUpSlack } from './grapple.ts'
import { IDLE_INPUT, type MovementInput } from './movementInput.ts'
import {
  FLOOR,
  runTicks,
  SPRINT_FORWARD,
  shippedConfig,
  standingCharacter,
  tickDurationS,
  ticksFor,
} from './movementTestKit.ts'
import { stepCharacter } from './stepCharacter.ts'

const config = shippedConfig()
const { grapple, movement } = config
const dtS = tickDurationS(config)

/** Um teto de 64 × 64 m com o fundo em y 20: tudo o que se mira para cima acerta. */
const CEILING: StaticBox = boxFromCenterSize([0, 20.5, 0], [64, 1, 64])
const WORLD: readonly StaticBox[] = [FLOOR, CEILING]
const GRAVITY = Math.abs(movement.gravityMps2)

function eyeOf(state: Readonly<CharacterState>): Vector3 {
  return grappleEyeM(state, { x: 0, y: 0, z: 0 })
}

/** A corda mede do pé (`grapple.ts`), e é do pé que o teste mede também. */
function distanceToAnchor(state: Readonly<CharacterState>): number {
  const feet = state.position
  const { x, y, z } = state.grappleAnchor
  return Math.sqrt((x - feet.x) ** 2 + (y - feet.y) ** 2 + (z - feet.z) ** 2)
}

/** A entrada de quem mira em `targetM` com o gancho preso. */
function aimAt(
  state: Readonly<CharacterState>,
  targetM: Readonly<Vector3>,
  base: MovementInput = IDLE_INPUT,
): MovementInput {
  const eye = eyeOf(state)
  return {
    ...base,
    grapple: true,
    aimX: targetM.x - eye.x,
    aimY: targetM.y - eye.y,
    aimZ: targetM.z - eye.z,
  }
}

/** De pé no chão, engata no teto acima de `targetXZ` e devolve a entrada que segura. */
function hookedCharacter(targetXZ: readonly [number, number] = [0, 0]) {
  const state = standingCharacter(config, WORLD)
  const input = aimAt(state, { x: targetXZ[0], y: 20, z: targetXZ[1] })
  stepCharacter(state, input, WORLD, config, dtS)
  return { state, input }
}

/**
 * Um pêndulo montado à mão: âncora no teto, pé afastado da vertical e parado,
 * corda esticada, carretel segurado (agachar). Sem o carretel não há pêndulo
 * para medir, só puxão.
 */
function pendulum(offsetM: number, ropeM: number) {
  const anchor = { x: 0, y: 20, z: 0 }
  const dropM = Math.sqrt(ropeM * ropeM - offsetM * offsetM)
  const state = createCharacterState({ x: offsetM, y: anchor.y - dropM, z: 0 }, config)
  state.grappleAttached = true
  state.grappleAnchor.x = anchor.x
  state.grappleAnchor.y = anchor.y
  state.grappleAnchor.z = anchor.z
  state.grappleRopeM = ropeM
  state.grappleCooldownLeftS = grapple.cooldownS
  state.grappleWasHeld = true
  const hold: MovementInput = { ...IDLE_INPUT, grapple: true, crouch: true }
  return { state, hold }
}

/** Energia por quilo: cinética mais potencial, com a gravidade do config. */
function energyPerKg(state: Readonly<CharacterState>): number {
  const { x, y, z } = state.velocity
  return 0.5 * (x * x + y * y + z * z) + GRAVITY * state.position.y
}

describe('gancho: disparo', () => {
  it('engata no ponto da mira, e a corda nasce com a distância do pé', () => {
    const { state } = hookedCharacter([6, 0])
    expect(state.grappleAttached).toBe(true)
    expect(state.grappleAnchor.y).toBeCloseTo(20)
    expect(state.grappleAnchor.x).toBeCloseTo(6)
    // a corda nasceu com o pé no chão, e o pulo do engate só a encurta.
    expect(state.grappleRopeM).toBeLessThanOrEqual(Math.sqrt(36 + 20 ** 2))
    expect(state.grappleRopeM).toBeGreaterThan(Math.sqrt(36 + 20 ** 2) - 1)
  })

  it('engatar no chão é pular: sai do piso e gasta o primeiro pulo', () => {
    const { state } = hookedCharacter([20, 0])
    expect(state.grounded).toBe(false)
    expect(state.position.y).toBeGreaterThan(0)
    expect(state.jumpsLeft).toBe(1)
  })

  it('engatar no ar não pula nem gasta pulo', () => {
    const { state, hold } = pendulum(6, 10)
    state.grappleAttached = false
    state.grappleCooldownLeftS = 0
    state.grappleWasHeld = false
    const fallingY = state.velocity.y
    stepCharacter(state, aimAt(state, { x: 0, y: 20, z: 0 }, hold), WORLD, config, dtS)
    expect(state.grappleAttached).toBe(true)
    expect(state.jumpsLeft).toBe(2)
    expect(state.velocity.y).toBeLessThanOrEqual(fallingY)
  })

  it('a mira não precisa vir unitária', () => {
    const state = standingCharacter(config, WORLD)
    const anchor = { x: 0, y: 0, z: 0 }
    const unit = findGrappleAnchor(state, { aimX: 0, aimY: 1, aimZ: 0 }, WORLD, config, anchor)
    const long = findGrappleAnchor(state, { aimX: 0, aimY: 30, aimZ: 0 }, WORLD, config, anchor)
    expect(long).toBeCloseTo(unit ?? Number.NaN)
    expect(anchor).toEqual({ x: 0, y: 20, z: 0 })
  })

  it('no vazio erra, não engata, e paga só a recarga curta', () => {
    const state = standingCharacter(config)
    stepCharacter(state, aimAt(state, { x: 0, y: 20, z: 0 }), [FLOOR], config, dtS)
    expect(state.grappleAttached).toBe(false)
    expect(state.grappleCooldownLeftS).toBeCloseTo(grapple.missCooldownS)
    expect(grapple.missCooldownS).toBeLessThan(grapple.cooldownS)
  })

  it('superfície além do alcance é vazio', () => {
    const farCeiling = boxFromCenterSize([0, grapple.maxRangeM + 3, 0], [64, 1, 64])
    const state = standingCharacter(config)
    const input = aimAt(state, { x: 0, y: 1000, z: 0 })
    stepCharacter(state, input, [FLOOR, farCeiling], config, dtS)
    expect(state.grappleAttached).toBe(false)
  })

  it('superfície mais perto que a corda mínima é vazio: não há o que puxar', () => {
    const state = standingCharacter(config, WORLD)
    const wall = boxFromCenterSize([grapple.minRopeLengthM - 1, 5, 0], [1, 10, 10])
    stepCharacter(state, aimAt(state, { x: 10, y: 1.6, z: 0 }), [FLOOR, wall], config, dtS)
    expect(state.grappleAttached).toBe(false)
  })

  it('mira nula não tem direção, e erra', () => {
    const state = standingCharacter(config, WORLD)
    stepCharacter(state, { ...IDLE_INPUT, grapple: true }, WORLD, config, dtS)
    expect(state.grappleAttached).toBe(false)
    expect(state.grappleCooldownLeftS).toBeCloseTo(grapple.missCooldownS)
  })

  it('dispara na descida da tecla, não com ela presa', () => {
    const state = standingCharacter(config)
    const input = aimAt(state, { x: 0, y: 20, z: 0 })
    stepCharacter(state, input, [FLOOR], config, dtS)
    runTicks(state, input, ticksFor(grapple.missCooldownS + 0.1, config), config, WORLD)
    expect(state.grappleAttached).toBe(false)
  })

  it('o engate encerra o slide: a corda manda no movimento dali em diante', () => {
    const state = runTicks(standingCharacter(config, WORLD), SPRINT_FORWARD, 60, config, WORLD)
    stepCharacter(state, { ...SPRINT_FORWARD, crouch: true }, WORLD, config, dtS)
    expect(state.stance).toBe('sliding')
    stepCharacter(state, aimAt(state, { x: 0, y: 20, z: 30 }), WORLD, config, dtS)
    expect(state.grappleAttached).toBe(true)
    expect(state.stance).toBe('standing')
    expect(state.capsuleHeightM).toBe(config.collision.capsuleHeightM)
  })
})

describe('gancho: recarga', () => {
  it('trava cheia no engate, parada enquanto engatado, e desce da soltura', () => {
    const { state, input } = hookedCharacter()
    expect(state.grappleCooldownLeftS).toBe(grapple.cooldownS)
    runTicks(state, input, 30, config, WORLD)
    expect(state.grappleCooldownLeftS).toBe(grapple.cooldownS)
    stepCharacter(state, IDLE_INPUT, WORLD, config, dtS)
    stepCharacter(state, IDLE_INPUT, WORLD, config, dtS)
    expect(state.grappleCooldownLeftS).toBeCloseTo(grapple.cooldownS - dtS)
  })

  it('em recarga, o aperto não dispara; pronta, dispara de novo', () => {
    const { state, input } = hookedCharacter()
    stepCharacter(state, IDLE_INPUT, WORLD, config, dtS)
    stepCharacter(state, input, WORLD, config, dtS)
    expect(state.grappleAttached).toBe(false)
    runTicks(state, IDLE_INPUT, ticksFor(grapple.cooldownS, config), config, WORLD)
    expect(state.grappleCooldownLeftS).toBe(0)
    stepCharacter(state, aimAt(state, { x: 0, y: 20, z: 0 }), WORLD, config, dtS)
    expect(state.grappleAttached).toBe(true)
  })

  it('o engate solta sozinho em maxAttachedS', () => {
    const { state, input } = hookedCharacter()
    runTicks(state, input, ticksFor(grapple.maxAttachedS, config) - 2, config, WORLD)
    expect(state.grappleAttached).toBe(true)
    runTicks(state, input, 3, config, WORLD)
    expect(state.grappleAttached).toBe(false)
  })
})

describe('gancho: corda', () => {
  it('o carretel puxa o jogador para a âncora, mais rápido que correr', () => {
    const { state, input } = hookedCharacter([0, 12])
    const startM = distanceToAnchor(state)
    runTicks(state, input, ticksFor(0.5, config), config, WORLD)
    expect(distanceToAnchor(state)).toBeLessThan(startM - 4)
    const speed = Math.sqrt(state.velocity.x ** 2 + state.velocity.y ** 2 + state.velocity.z ** 2)
    expect(speed).toBeGreaterThan(movement.sprintSpeedMps)
  })

  it('a corda só encurta, e nunca abaixo do mínimo', () => {
    const { state, input } = hookedCharacter([4, 8])
    let previousM = state.grappleRopeM
    for (let tick = 0; tick < ticksFor(grapple.maxAttachedS - 0.1, config); tick += 1) {
      stepCharacter(state, input, WORLD, config, dtS)
      expect(state.grappleRopeM).toBeLessThanOrEqual(previousM)
      expect(state.grappleRopeM).toBeGreaterThanOrEqual(grapple.minRopeLengthM)
      previousM = state.grappleRopeM
    }
    // no teto, quem para o carretel é a cabeça: o pé fica a uma cápsula da
    // âncora, acima do mínimo, e a corda não encurta através da laje.
    expect(state.grappleRopeM).toBeCloseTo(config.collision.capsuleHeightM, 3)
  })

  it('numa parede, o carretel recolhe até o mínimo e para', () => {
    const wall = boxFromCenterSize([12.5, 10, 0], [1, 20, 20])
    const state = standingCharacter(config, [FLOOR, wall])
    const input = aimAt(state, { x: 12, y: 4, z: 0 })
    runTicks(state, input, ticksFor(1.5, config), config, [FLOOR, wall])
    expect(state.grappleAttached).toBe(true)
    expect(state.grappleRopeM).toBe(grapple.minRopeLengthM)
  })

  it('a distância até a âncora nunca passa da corda, nem empurrando para longe', () => {
    const { state, hold } = pendulum(6, 10)
    const pushAway: MovementInput = { ...hold, wishX: 1 }
    for (let tick = 0; tick < ticksFor(2.5, config); tick += 1) {
      stepCharacter(state, pushAway, WORLD, config, dtS)
      expect(distanceToAnchor(state)).toBeLessThanOrEqual(state.grappleRopeM + 0.01)
    }
  })

  it('o empurrão do jogador acelera o balanço', () => {
    const still = pendulum(0.5, 10)
    const pushed = pendulum(0.5, 10)
    runTicks(still.state, still.hold, 20, config, WORLD)
    runTicks(pushed.state, { ...pushed.hold, wishZ: 1 }, 20, config, WORLD)
    expect(pushed.state.velocity.z).toBeGreaterThan(still.state.velocity.z + 1)
  })

  it('a velocidade inteira tem o teto de maxPullSpeedMps enquanto engatado', () => {
    const { state, hold } = pendulum(6, 10)
    state.velocity.y = -60
    stepCharacter(state, hold, WORLD, config, dtS)
    const speed = Math.sqrt(state.velocity.x ** 2 + state.velocity.y ** 2 + state.velocity.z ** 2)
    expect(speed).toBeLessThanOrEqual(grapple.maxPullSpeedMps + 1e-9)
  })

  it('pé exatamente na âncora não tem direção: nada vira NaN', () => {
    const { state, hold } = pendulum(6, 10)
    state.grappleAnchor.x = state.position.x
    state.grappleAnchor.y = state.position.y
    state.grappleAnchor.z = state.position.z
    state.velocity.x = 3
    pullOnRope(state, hold, config, dtS)
    takeUpSlack(state, config)
    expect(state.velocity.x).toBe(3)
    expect(state.grappleRopeM).toBe(grapple.minRopeLengthM)
  })
})

describe('gancho: pêndulo', () => {
  /**
   * Sem carretel e sem empurrão, a corda é restrição pura: ela não pode criar
   * nem gastar energia, só desviar a velocidade. A tolerância é o erro da
   * integração a 60 Hz em meio período.
   */
  it('sem entrada, conserva a energia em meio balanço', () => {
    const { state, hold } = pendulum(6, 10)
    const before = energyPerKg(state)
    const halfPeriodS = Math.PI * Math.sqrt(10 / GRAVITY)
    let lowestY = state.position.y
    for (let tick = 0; tick < ticksFor(halfPeriodS, config); tick += 1) {
      stepCharacter(state, hold, WORLD, config, dtS)
      lowestY = Math.min(lowestY, state.position.y)
    }
    expect(Math.abs(energyPerKg(state) - before) / before).toBeLessThan(0.02)
    expect(lowestY).toBeLessThan(state.position.y - 1)
  })

  it('balança até o outro lado, na mesma altura', () => {
    const { state, hold } = pendulum(6, 10)
    const startY = state.position.y
    const halfPeriodS = Math.PI * Math.sqrt(10 / GRAVITY)
    let farthestX = 0
    for (let tick = 0; tick < ticksFor(halfPeriodS * 1.2, config); tick += 1) {
      stepCharacter(state, hold, WORLD, config, dtS)
      farthestX = Math.min(farthestX, state.position.x)
    }
    expect(farthestX).toBeLessThan(-5.7)
    expect(farthestX).toBeGreaterThan(-6.3)
    expect(state.position.y).toBeGreaterThan(startY - 1)
  })
})

describe('gancho: soltura', () => {
  it('soltar a tecla preserva a velocidade: só a gravidade do tick muda', () => {
    const { state, hold } = pendulum(6, 10)
    runTicks(state, hold, ticksFor(0.8, config), config, WORLD)
    const before = { ...state.velocity }
    stepCharacter(state, IDLE_INPUT, WORLD, config, dtS)
    expect(state.grappleAttached).toBe(false)
    expect(state.velocity.x).toBe(before.x)
    expect(state.velocity.z).toBe(before.z)
    expect(state.velocity.y).toBeCloseTo(before.y + movement.gravityMps2 * dtS)
  })

  it('a velocidade acima do teto do ar sobrevive no ar depois da soltura', () => {
    const { state, hold } = pendulum(8, 10)
    runTicks(state, hold, ticksFor(1, config), config, WORLD)
    stepCharacter(state, IDLE_INPUT, WORLD, config, dtS)
    const exit = horizontalSpeed(state)
    expect(exit).toBeGreaterThan(movement.airSpeedCapMps)
    runTicks(state, IDLE_INPUT, 5, config, WORLD)
    expect(horizontalSpeed(state)).toBeCloseTo(exit)
  })

  it('soltar devolve o pulo duplo a quem já tinha gastado os dois', () => {
    const { state, hold } = pendulum(6, 10)
    state.jumpsLeft = 0
    stepCharacter(state, hold, WORLD, config, dtS)
    stepCharacter(state, IDLE_INPUT, WORLD, config, dtS)
    expect(state.jumpsLeft).toBe(1)
  })

  it('pular solta a corda com impulso para cima e deixa só o pulo duplo', () => {
    const { state, hold } = pendulum(6, 10)
    state.jumpsLeft = 2
    stepCharacter(state, { ...hold, jump: true }, WORLD, config, dtS)
    expect(state.grappleAttached).toBe(false)
    expect(state.velocity.y).toBeGreaterThan(movement.jumpImpulseMps - 1)
    expect(state.jumpsLeft).toBe(1)
    expect(state.grappleCooldownLeftS).toBe(grapple.cooldownS)
  })

  it('pular para soltar não corta quem já subia mais rápido que o pulo', () => {
    const { state, hold } = pendulum(6, 10)
    state.velocity.y = 20
    stepCharacter(state, { ...hold, jump: true }, WORLD, config, dtS)
    expect(state.velocity.y).toBeCloseTo(20 + movement.gravityMps2 * dtS)
  })
})

describe('gancho: entrada', () => {
  it('mira não finita é recusada citando o valor', () => {
    const state = standingCharacter(config)
    const input = { ...IDLE_INPUT, aimY: Number.NaN }
    expect(() => stepCharacter(state, input, [FLOOR], config, dtS)).toThrow(/aim \[0, NaN, 0\]/)
  })
})
