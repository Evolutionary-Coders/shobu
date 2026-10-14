import { describe, expect, it } from 'vitest'
import { boxFromCenterSize } from '../collision/staticBox.ts'
import type { CharacterState } from '../movement/characterState.ts'
import { IDLE_INPUT } from '../movement/movementInput.ts'
import {
  FLOOR,
  shippedConfig,
  standingCharacter,
  tickDurationS,
} from '../movement/movementTestKit.ts'
import { stepCharacter } from '../movement/stepCharacter.ts'
import {
  ARRIVE_RADIUS_M,
  createBotLocomotion,
  hasReached,
  type LegStatus,
  type MutableMovementInput,
  routeTo,
  steerToward,
  walkRoute,
} from './botLocomotion.ts'
import { createNavGraph, type NavGraph } from './navGraph.ts'

const config = shippedConfig()
const DT_S = tickDurationS(config)

/** Uma rua reta de 12 m e, no fim, um bloco de 2,2 m que só o pulo duplo sobe. */
const BLOCK = boxFromCenterSize([0, 1.1, 16], [4, 2.2, 4])
const GRAPH: NavGraph = createNavGraph(
  [
    { name: 'inicio', feetM: { x: 0, y: 0, z: 0 } },
    { name: 'meio', feetM: { x: 0, y: 0, z: 8 } },
    { name: 'pe-do-bloco', feetM: { x: 0, y: 0, z: 11.3 } },
    { name: 'topo', feetM: { x: 0, y: 2.2, z: 16 } },
  ],
  [
    { from: 'inicio', to: 'meio', kind: 'walk' },
    { from: 'meio', to: 'pe-do-bloco', kind: 'walk' },
    { from: 'pe-do-bloco', to: 'topo', kind: 'jump' },
  ],
)

function freshInput(): MutableMovementInput {
  return { ...IDLE_INPUT }
}

/** Anda até a rota acabar ou o prazo vencer, e devolve o último estado das pernas. */
function walkUntilDone(
  body: CharacterState,
  to: number,
  seconds: number,
  boxes = [FLOOR, BLOCK],
): LegStatus {
  const locomotion = createBotLocomotion(GRAPH)
  routeTo(locomotion, GRAPH, 0, to)
  const input = freshInput()
  let status: LegStatus = 'moving'
  for (let tick = 0; tick < seconds / DT_S && status !== 'arrived'; tick += 1) {
    status = walkRoute(locomotion, body, GRAPH, config.bots, input, DT_S)
    stepCharacter(body, input, boxes, config, DT_S)
  }
  return status
}

describe('walkRoute', () => {
  it('anda a rota até o fim e para', () => {
    const body = standingCharacter(config, [FLOOR, BLOCK])
    expect(walkUntilDone(body, 2, 5)).toBe('arrived')
    expect(Math.abs(body.position.z - 11.3)).toBeLessThanOrEqual(ARRIVE_RADIUS_M)
  })

  /** O pulo duplo do jogador, do pé do bloco ao topo: o mesmo `stepCharacter`. */
  it('sobe no bloco de 2,2 m com o pulo duplo', () => {
    const body = standingCharacter(config, [FLOOR, BLOCK])
    expect(walkUntilDone(body, 3, 8)).toBe('arrived')
    // apoiado é estar a até 2 cm do piso (a sondagem de chão do sweep).
    expect(body.position.y).toBeCloseTo(2.2, 1)
  })

  it('rota vazia não anda e responde que chegou', () => {
    const locomotion = createBotLocomotion(GRAPH)
    const input = freshInput()
    input.wishZ = 1
    const status = walkRoute(locomotion, standingCharacter(config), GRAPH, config.bots, input, DT_S)
    expect(status).toBe('arrived')
    expect([input.wishX, input.wishZ, input.sprint]).toEqual([0, 0, false])
  })

  /**
   * Preso é não chegar mais perto: correndo contra a parede, o bot está a toda
   * velocidade e não sai do lugar.
   */
  it('contra uma parede, avisa que está preso depois de stuckAfterS', () => {
    const wall = boxFromCenterSize([0, 5, 2], [20, 10, 1])
    const body = standingCharacter(config, [FLOOR, wall])
    const locomotion = createBotLocomotion(GRAPH)
    routeTo(locomotion, GRAPH, 0, 1)
    const input = freshInput()
    const statuses: LegStatus[] = []
    const ticks = Math.ceil((config.bots.stuckAfterS + 1) / DT_S)
    for (let tick = 0; tick < ticks; tick += 1) {
      statuses.push(walkRoute(locomotion, body, GRAPH, config.bots, input, DT_S))
      stepCharacter(body, input, [FLOOR, wall], config, DT_S)
    }
    expect(statuses).toContain('stuck')
    expect(locomotion.stuckCount).toBeGreaterThanOrEqual(1)
  })

  it('o progresso zera a contagem de preso', () => {
    const locomotion = createBotLocomotion(GRAPH)
    routeTo(locomotion, GRAPH, 0, 1)
    locomotion.stuckCount = 3
    walkRoute(locomotion, standingCharacter(config), GRAPH, config.bots, freshInput(), DT_S)
    expect(locomotion.stuckCount).toBe(0)
  })
})

describe('steerToward', () => {
  it('aponta no chão para o alvo, com comprimento 1', () => {
    const input = freshInput()
    steerToward(standingCharacter(config), { x: 3, y: 0, z: 4 }, 'walk', input)
    expect([input.wishX, input.wishZ]).toEqual([0.6, 0.8])
    expect(input.sprint).toBe(true)
  })

  it('em cima do alvo não pede direção nenhuma', () => {
    const input = freshInput()
    steerToward(standingCharacter(config), { x: 0, y: 0, z: 0 }, 'drop', input)
    expect([input.wishX, input.wishZ]).toEqual([0, 0])
  })

  it('não pula num trecho a pé, nem com o alvo acima', () => {
    const input = freshInput()
    steerToward(standingCharacter(config), { x: 0, y: 4.5, z: 3 }, 'walk', input)
    expect(input.jump).toBe(false)
  })

  it('no trecho de pulo, não pula de novo com o pé já na altura do alvo', () => {
    const input = freshInput()
    steerToward(standingCharacter(config), { x: 0, y: 0.2, z: 3 }, 'jump', input)
    expect(input.jump).toBe(false)
  })

  /** A borda: pulo é descida de tecla, e a tecla presa no tick anterior não pula. */
  it('não pede pulo com a tecla ainda presa do tick anterior', () => {
    const body = standingCharacter(config)
    body.jumpWasHeld = true
    const input = freshInput()
    steerToward(body, { x: 0, y: 2.2, z: 3 }, 'jump', input)
    expect(input.jump).toBe(false)
  })

  it('no ar, pede o segundo pulo só no alto do arco', () => {
    const body = standingCharacter(config)
    body.grounded = false
    body.jumpsLeft = 1
    body.velocity.y = 6
    const input = freshInput()
    steerToward(body, { x: 0, y: 2.2, z: 3 }, 'jump', input)
    expect(input.jump).toBe(false)
    body.velocity.y = 0.5
    steerToward(body, { x: 0, y: 2.2, z: 3 }, 'jump', input)
    expect(input.jump).toBe(true)
  })
})

describe('hasReached', () => {
  const target = { x: 0, y: 0, z: 0 }

  it('perto, na altura e apoiado é chegada', () => {
    expect(hasReached(standingCharacter(config), target)).toBe(true)
  })

  /** Passar por cima do ponto numa queda não é ter chegado nele. */
  it('no ar não é chegada', () => {
    const body = standingCharacter(config)
    body.grounded = false
    expect(hasReached(body, target)).toBe(false)
  })

  it('um andar acima não é chegada', () => {
    expect(hasReached(standingCharacter(config), { x: 0, y: 4.5, z: 0 })).toBe(false)
  })

  it('longe no chão não é chegada', () => {
    expect(hasReached(standingCharacter(config), { x: 0, y: 0, z: 2 })).toBe(false)
  })
})

describe('o primeiro trecho', () => {
  /** A rota começa no nó mais perto, e chegar até ele é sempre a pé. */
  it('até o nó de saída anda, mesmo que o grafo só tenha pulo ali', () => {
    const body = standingCharacter(config)
    body.position.z = -3
    const locomotion = createBotLocomotion(GRAPH)
    routeTo(locomotion, GRAPH, 2, 3)
    const input = freshInput()
    walkRoute(locomotion, body, GRAPH, config.bots, input, DT_S)
    expect([input.sprint, input.jump]).toEqual([true, false])
  })

  it('trecho sem ligação no grafo anda', () => {
    const body = standingCharacter(config)
    const locomotion = createBotLocomotion(GRAPH)
    routeTo(locomotion, GRAPH, 3, 0)
    expect(locomotion.route.length).toBe(0)
    locomotion.route.nodes.set([0, 3])
    locomotion.route.length = 2
    locomotion.route.cursor = 1
    const input = freshInput()
    walkRoute(locomotion, body, GRAPH, config.bots, input, DT_S)
    expect(input.sprint).toBe(true)
  })
})
