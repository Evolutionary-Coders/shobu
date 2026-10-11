import { describe, expect, it } from 'vitest'
import { boxFromCenterSize } from '../collision/staticBox.ts'
import { createCharacterState, horizontalSpeed, JUMPS_PER_FLIGHT } from './characterState.ts'
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
import { SLIDE_CAPSULE_RATIO } from './slide.ts'
import { stepCharacter } from './stepCharacter.ts'

const config = shippedConfig()
const { movement, collision } = config
const dtS = tickDurationS(config)
const JUMP = { ...IDLE_INPUT, jump: true }
const SLIDE_HELD = { ...SPRINT_FORWARD, crouch: true }

/** Corre até a corrida tática estar plena — a pré-condição do slide. */
function sprintingCharacter() {
  return runTicks(standingCharacter(config), SPRINT_FORWARD, ticksFor(1, config), config)
}

/** Entra no slide: a tecla desce num tick e sobe no seguinte. */
function slidingCharacter() {
  const state = sprintingCharacter()
  stepCharacter(state, SLIDE_HELD, [FLOOR], config, dtS)
  stepCharacter(state, SPRINT_FORWARD, [FLOOR], config, dtS)
  return state
}

describe('stepCharacter: chão', () => {
  it('quem nasce no ar cai e assenta no chão', () => {
    const state = createCharacterState({ x: 0, y: 1, z: 0 }, config)
    runTicks(state, IDLE_INPUT, ticksFor(1, config), config)
    expect(state.grounded).toBe(true)
    expect(state.position.y).toBe(0)
    expect(state.velocity.y).toBe(0)
  })

  it('wasd chega à velocidade de corrida e não passa dela', () => {
    const state = runTicks(standingCharacter(config), FORWARD, ticksFor(1, config), config)
    expect(horizontalSpeed(state)).toBeCloseTo(movement.runSpeedMps)
  })

  it('shift leva à corrida tática', () => {
    const state = runTicks(standingCharacter(config), SPRINT_FORWARD, ticksFor(1, config), config)
    expect(horizontalSpeed(state)).toBeCloseTo(movement.sprintSpeedMps)
    expect(state.sprinting).toBe(true)
  })

  /** Pilar 3: soltar shift devolve à corrida, nunca abaixo dela. */
  it('soltar shift decai até a corrida e para lá', () => {
    const state = runTicks(sprintingCharacter(), FORWARD, ticksFor(0.5, config), config)
    expect(horizontalSpeed(state)).toBeCloseTo(movement.runSpeedMps)
  })

  it('sem entrada, freia até parar', () => {
    const state = runTicks(sprintingCharacter(), IDLE_INPUT, ticksFor(0.5, config), config)
    expect(horizontalSpeed(state)).toBe(0)
  })

  it('shift parado não é corrida', () => {
    const state = standingCharacter(config)
    stepCharacter(state, { ...IDLE_INPUT, sprint: true }, [FLOOR], config, dtS)
    expect(state.sprinting).toBe(false)
  })
})

describe('stepCharacter: pulo', () => {
  it('pula na descida da tecla e sobe até perto de v²/2g', () => {
    const state = standingCharacter(config)
    let peak = 0
    for (let tick = 0; tick < ticksFor(1, config); tick += 1) {
      stepCharacter(state, tick === 0 ? JUMP : IDLE_INPUT, [FLOOR], config, dtS)
      peak = Math.max(peak, state.position.y)
    }
    const expected = movement.jumpImpulseMps ** 2 / (2 * -movement.gravityMps2)
    expect(peak).toBeGreaterThan(expected * 0.9)
    expect(peak).toBeLessThanOrEqual(expected)
    expect(state.grounded).toBe(true)
  })

  it('o pulo duplo é um segundo impulso, mais fraco, e não há terceiro', () => {
    const state = standingCharacter(config)
    stepCharacter(state, JUMP, [FLOOR], config, dtS)
    runTicks(state, IDLE_INPUT, 5, config)
    stepCharacter(state, JUMP, [FLOOR], config, dtS)
    expect(state.velocity.y).toBeCloseTo(movement.doubleJumpImpulseMps + movement.gravityMps2 * dtS)
    expect(state.jumpsLeft).toBe(0)
    runTicks(state, IDLE_INPUT, 5, config)
    const before = state.velocity.y
    stepCharacter(state, JUMP, [FLOOR], config, dtS)
    expect(state.velocity.y).toBeCloseTo(before + movement.gravityMps2 * dtS)
  })

  it('tecla presa não repete o pulo ao aterrissar', () => {
    const state = runTicks(standingCharacter(config), JUMP, ticksFor(2, config), config)
    expect(state.grounded).toBe(true)
    expect(state.position.y).toBe(0)
  })

  it('cair de uma borda sem pular mantém os dois pulos', () => {
    const ledge = boxFromCenterSize([0, 1, 0], [4, 2, 4])
    const state = createCharacterState({ x: 1.5, y: 2, z: 0 }, config)
    runTicks(state, IDLE_INPUT, 2, config, [FLOOR, ledge])
    runTicks(state, { ...IDLE_INPUT, wishX: 1 }, ticksFor(0.3, config), config, [FLOOR, ledge])
    expect(state.grounded).toBe(false)
    expect(state.jumpsLeft).toBe(JUMPS_PER_FLIGHT)
  })

  it('no ar a aceleração respeita o teto', () => {
    const state = standingCharacter(config)
    stepCharacter(state, { ...JUMP, wishZ: 1 }, [FLOOR], config, dtS)
    for (let tick = 0; tick < ticksFor(0.6, config); tick += 1) {
      stepCharacter(state, FORWARD, [FLOOR], config, dtS)
      expect(horizontalSpeed(state)).toBeLessThanOrEqual(movement.airSpeedCapMps + 1e-9)
    }
  })
})

describe('stepCharacter: slide', () => {
  /**
   * Parede no meio do slide: o sweep zera a velocidade do eixo, e o tick
   * seguinte pede a desaceleração com velocidade horizontal zero. Sem a guarda
   * de `decelerateSlide`, a escala seria uma divisão por zero e o jogador
   * ganharia posição NaN — sai do mapa e não volta.
   */
  it('slide contra parede não produz velocidade NaN', () => {
    const state = sprintingCharacter()
    // a parede vai onde o jogador está, não numa coordenada fixa: a corrida
    // que precede o slide já o levou metros para frente.
    const wall = boxFromCenterSize([0, 5, state.position.z + 1], [20, 10, 1])
    stepCharacter(state, SLIDE_HELD, [FLOOR, wall], config, dtS)
    runTicks(state, SPRINT_FORWARD, ticksFor(0.5, config), config, [FLOOR, wall])
    expect(Number.isFinite(state.velocity.x)).toBe(true)
    expect(Number.isFinite(state.velocity.z)).toBe(true)
    expect(Number.isFinite(state.position.z)).toBe(true)
  })

  it('entra em slide a partir da corrida tática, com a velocidade atribuída', () => {
    const state = sprintingCharacter()
    stepCharacter(state, SLIDE_HELD, [FLOOR], config, dtS)
    expect(state.stance).toBe('sliding')
    expect(horizontalSpeed(state)).toBeCloseTo(movement.slideImpulseMps)
    expect(state.capsuleHeightM).toBeCloseTo(collision.capsuleHeightM * SLIDE_CAPSULE_RATIO)
  })

  /** Sem corrida tática a tecla é agachar: é a ordem em `moveOnIntent`. */
  it('andando sem shift, a tecla agacha em vez de deslizar', () => {
    const state = runTicks(standingCharacter(config), FORWARD, ticksFor(1, config), config)
    stepCharacter(state, { ...FORWARD, crouch: true }, [FLOOR], config, dtS)
    expect(state.stance).toBe('crouching')
  })

  it('desacelera até a corrida e termina de pé, com cooldown contando do fim', () => {
    const state = slidingCharacter()
    let ticks = 0
    while (state.stance === 'sliding' && ticks < 60) {
      stepCharacter(state, SPRINT_FORWARD, [FLOOR], config, dtS)
      ticks += 1
    }
    expect(ticks).toBe(ticksFor(movement.slideDurationS, config) - 1)
    // no tick em que o slide acaba a velocidade é a de corrida (derivada do
    // modelo); a menos de um tick de desaceleração, que o arredondamento come.
    expect(horizontalSpeed(state)).toBeCloseTo(movement.runSpeedMps, 0)
    expect(state.capsuleHeightM).toBe(collision.capsuleHeightM)
    expect(state.slideCooldownLeftS).toBeGreaterThan(0)
  })

  it('cancelar cedo herda mais velocidade que deixar acabar', () => {
    const state = slidingCharacter()
    runTicks(state, SPRINT_FORWARD, ticksFor(0.3, config), config)
    stepCharacter(state, SLIDE_HELD, [FLOOR], config, dtS)
    expect(state.stance).toBe('standing')
    expect(horizontalSpeed(state)).toBeGreaterThan(movement.runSpeedMps + 1)
    expect(horizontalSpeed(state)).toBeLessThan(movement.slideImpulseMps)
  })

  it('a própria tecla não cancela antes da janela', () => {
    const state = slidingCharacter()
    runTicks(state, SPRINT_FORWARD, 2, config)
    stepCharacter(state, SLIDE_HELD, [FLOOR], config, dtS)
    expect(state.stance).toBe('sliding')
  })

  it('pular do slide leva a velocidade herdada para o ar', () => {
    const state = slidingCharacter()
    runTicks(state, SPRINT_FORWARD, 3, config)
    stepCharacter(state, { ...SPRINT_FORWARD, jump: true }, [FLOOR], config, dtS)
    expect(state.stance).toBe('standing')
    expect(state.grounded).toBe(false)
    runTicks(state, SPRINT_FORWARD, ticksFor(0.3, config), config)
    expect(horizontalSpeed(state)).toBeGreaterThan(movement.sprintSpeedMps)
  })

  it('não repete o slide durante o cooldown: a tecla só agacha', () => {
    const state = slidingCharacter()
    runTicks(state, SPRINT_FORWARD, ticksFor(movement.slideDurationS, config), config)
    runTicks(state, SPRINT_FORWARD, ticksFor(0.3, config), config)
    stepCharacter(state, SLIDE_HELD, [FLOOR], config, dtS)
    expect(state.stance).toBe('crouching')
  })
})

describe('stepCharacter: guardas', () => {
  it('recusa duração de tick que não avança', () => {
    const state = standingCharacter(config)
    expect(() => stepCharacter(state, IDLE_INPUT, [FLOOR], config, 0)).toThrow(/dtS recebeu 0/)
  })

  it('recusa entrada com NaN antes de corromper o estado', () => {
    const state = standingCharacter(config)
    const poisoned = { ...IDLE_INPUT, wishX: Number.NaN }
    expect(() => stepCharacter(state, poisoned, [FLOOR], config, dtS)).toThrow(/NaN/)
    expect(state.position.x).toBe(0)
  })
})
