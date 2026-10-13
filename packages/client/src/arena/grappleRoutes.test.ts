import { readFileSync } from 'node:fs'
import {
  type CharacterState,
  createCharacterState,
  EYE_HEIGHT_RATIO,
  type GameplayConfig,
  IDLE_INPUT,
  type MovementInput,
  parseGameplayConfig,
  type StaticBox,
  stepCharacter,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { blockTopM, type GreyboxBlock } from './arenaBlock.ts'
import { arenaCollisionBoxes } from './collisionBoxes.ts'
import { ICHIBAN_GAI_BLOCKOUT } from './ichibanGai.ts'
import { ICHIBAN_GAI_MAP } from './ichibanGaiMap.ts'
import { NEON_KAIDO_MID_M, NEON_KAIDO_TOP_M } from './neonKaido.ts'
import { NEON_KAIDO_MAP } from './neonKaidoMap.ts'

/**
 * As rotas do gancho que o gdd promete, simuladas na arena de verdade e com o
 * config versionado: "a passarela do meio é a rota principal de trânsito, e o
 * uso mais frequente do gancho". Se um número do gancho ou a geometria da ponte
 * mudar e a rota deixar de fechar, é aqui que se descobre, e não no playtest.
 *
 * O jogador simulado é **competente, não perfeito**: segura até a corda
 * chegar ao mínimo e parar, pula para soltar, usa o pulo duplo quando começa a
 * cair, e empurra para o alvo até estar acima dele. É a sequência que se
 * ensina em uma frase.
 */
const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config: GameplayConfig = parseGameplayConfig(
  JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')),
)
const ICHIBAN_BOXES: readonly StaticBox[] = arenaCollisionBoxes(ICHIBAN_GAI_MAP)
const NEON_BOXES: readonly StaticBox[] = arenaCollisionBoxes(NEON_KAIDO_MAP)
const DT_S = 1 / config.simulation.tickHz
/** De pé, de onde o cabo sai: é para lá que a mira aponta. */
const EYE_OVER_FEET_M = config.collision.capsuleHeightM * EYE_HEIGHT_RATIO

function blockNamed(name: string): GreyboxBlock {
  const block = ICHIBAN_GAI_BLOCKOUT.find((candidate) => candidate.name === name)
  if (!block) throw new Error(`o layout não tem o bloco ${name}`)
  return block
}

function southFaceOf(block: GreyboxBlock): number {
  return block.centerM[2] - block.sizeM[2] / 2
}

interface Climb {
  /** As caixas do mapa em que a rota corre. */
  readonly boxes: readonly StaticBox[]
  readonly startFeetM: readonly [number, number, number]
  /** Um ponto da face, logo abaixo da quina. */
  readonly anchorM: readonly [number, number, number]
  /** A altura do piso de cima, onde a rota termina. */
  readonly topM: number
}

/** O que o jogador simulado já fez da rota. */
interface ClimbProgress {
  released: boolean
  doubleJumped: boolean
}

/** Segundos até estar de pé no piso de cima, ou `Infinity` se não chegou em 4 s. */
function climbSeconds(route: Climb): number {
  const state = settle(createCharacterState(feet(route.startFeetM), config), route.boxes)
  const progress: ClimbProgress = { released: false, doubleJumped: false }
  for (let tick = 0; tick < 4 * config.simulation.tickHz; tick += 1) {
    stepCharacter(state, nextClimbInput(state, route, progress), route.boxes, config, DT_S)
    if (state.grounded && state.position.y >= route.topM - 0.01) return (tick + 1) * DT_S
  }
  return Number.POSITIVE_INFINITY
}

/** Segura até a corda parar no mínimo; aí pula para soltar, e pula de novo ao cair. */
function nextClimbInput(
  state: Readonly<CharacterState>,
  route: Climb,
  progress: ClimbProgress,
): MovementInput {
  const hanging = state.grappleAttached && state.grappleRopeM <= config.grapple.minRopeLengthM
  const speed = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z)
  const letGo = !progress.released && hanging && speed < 2
  const doubleJump = progress.released && !progress.doubleJumped && state.velocity.y < 0
  progress.doubleJumped ||= doubleJump
  const input = climbInput(state, route, !progress.released && !letGo, letGo || doubleJump)
  progress.released ||= letGo
  return input
}

function climbInput(
  state: Readonly<CharacterState>,
  route: Climb,
  holding: boolean,
  jump: boolean,
): MovementInput {
  const [x, y, z] = route.anchorM
  const below = state.position.y < route.topM + 0.3
  return {
    ...IDLE_INPUT,
    grapple: holding,
    jump,
    wishZ: !holding && below ? 1 : 0,
    aimX: x - state.position.x,
    aimY: y - (state.position.y + EYE_OVER_FEET_M),
    aimZ: z - state.position.z,
  }
}

function feet([x, y, z]: readonly [number, number, number]) {
  return { x, y, z }
}

function settle(state: CharacterState, boxes: readonly StaticBox[]): CharacterState {
  for (let tick = 0; tick < 5; tick += 1) stepCharacter(state, IDLE_INPUT, boxes, config, DT_S)
  return state
}

describe('as rotas do gancho no Ichiban-gai', () => {
  const bridge = blockNamed('ponte-a')
  const market = blockNamed('mercado-a')

  it('da rua, a quina da ponte põe o jogador em cima dela em menos de 2,5 s', () => {
    const x = bridge.centerM[0] - bridge.sizeM[0] / 2 + 2
    const face = southFaceOf(bridge)
    const seconds = climbSeconds({
      boxes: ICHIBAN_BOXES,
      startFeetM: [x, 0, face - 12.5],
      anchorM: [x, blockTopM(bridge) - 0.05, face],
      topM: blockTopM(bridge),
    })
    expect(seconds).toBeLessThan(2.5)
  })

  it('da ponte, a quina do mercado põe o jogador no telhado em menos de 2,5 s', () => {
    const x = market.centerM[0]
    const face = southFaceOf(market)
    const seconds = climbSeconds({
      boxes: ICHIBAN_BOXES,
      startFeetM: [x, blockTopM(bridge), bridge.centerM[2]],
      anchorM: [x, blockTopM(market) - 0.05, face],
      topM: blockTopM(market),
    })
    expect(seconds).toBeLessThan(2.5)
  })

  it('da avenida, o mesmo telhado sai direto do chão, sem escada', () => {
    const x = market.centerM[0]
    const face = southFaceOf(market)
    const seconds = climbSeconds({
      boxes: ICHIBAN_BOXES,
      startFeetM: [x, 0, face - 6],
      anchorM: [x, blockTopM(market) - 0.05, face],
      topM: blockTopM(market),
    })
    expect(seconds).toBeLessThan(2.5)
  })
})

/**
 * No Neon-kaidō o gancho é o atalho entre as camadas que as escadas ligam pelo
 * caminho longo: da rua para a passarela, da engawa para o terraço e, para
 * quem tem coragem, da rua direto para o terraço — 13 m numa puxada.
 */
describe('as rotas do gancho no Neon-kaidō', () => {
  it('do Kaidō, a quina da passarela põe o jogador em cima dela em menos de 2,5 s', () => {
    const seconds = climbSeconds({
      boxes: NEON_BOXES,
      startFeetM: [0, 0, -9],
      anchorM: [0, NEON_KAIDO_MID_M - 0.05, 3],
      topM: NEON_KAIDO_MID_M,
    })
    expect(seconds).toBeLessThan(2.5)
  })

  it('da engawa, a beira do terraço põe o jogador no topo em menos de 2,5 s', () => {
    const seconds = climbSeconds({
      boxes: NEON_BOXES,
      startFeetM: [-5.5, NEON_KAIDO_MID_M, -12],
      anchorM: [-8, NEON_KAIDO_TOP_M - 0.05, -6.5],
      topM: NEON_KAIDO_TOP_M,
    })
    expect(seconds).toBeLessThan(2.5)
  })

  it('do Kaidō, o terraço sai direto do chão em menos de 3,5 s', () => {
    const seconds = climbSeconds({
      boxes: NEON_BOXES,
      startFeetM: [0, 0, 10],
      // a quina da platibanda, na beira do terraço sobre a rua.
      anchorM: [-6.5, NEON_KAIDO_TOP_M + 1.05, 10],
      topM: NEON_KAIDO_TOP_M,
    })
    expect(seconds).toBeLessThan(3.5)
  })
})
