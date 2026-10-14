import type { BotsConfig } from '../config/gameplayConfig.ts'
import type { Vector3 } from '../math/vector3.ts'
import type { CharacterState } from '../movement/characterState.ts'
import type { MovementInput } from '../movement/movementInput.ts'
import { linkBetween, type NavGraph, type NavLink, type NavLinkKind } from './navGraph.ts'
import {
  createNavRoute,
  createRoutePlanner,
  currentWaypoint,
  type NavRoute,
  planRoute,
  previousWaypoint,
  type RoutePlanner,
} from './navRoute.ts'

/**
 * As pernas do bot: segue a rota do grafo escrevendo o **mesmo**
 * `MovementInput` que o teclado do jogador escreve. Não há atalho de física
 * aqui — quem move o corpo é `stepCharacter`, com pulo duplo, degrau e
 * colisão iguais aos do jogador (ADR 0016).
 */
export type MutableMovementInput = { -readonly [Key in keyof MovementInput]: MovementInput[Key] }

export interface BotLocomotion {
  readonly route: NavRoute
  readonly planner: RoutePlanner
  /** O nó do fim da rota. */
  destination: number
  /** A menor distância no chão até o ponto atual desde que ele virou o atual. */
  closestM: number
  /** Há quanto tempo essa distância não diminui. */
  stalledS: number
  /** Quantas vezes seguidas o bot se viu preso no mesmo trecho. */
  stuckCount: number
}

export function createBotLocomotion(graph: NavGraph): BotLocomotion {
  return {
    route: createNavRoute(graph),
    planner: createRoutePlanner(graph),
    destination: -1,
    closestM: Number.POSITIVE_INFINITY,
    stalledS: 0,
    stuckCount: 0,
  }
}

/** Raio, no chão, em que o ponto conta como alcançado. Menor que meio corredor. */
export const ARRIVE_RADIUS_M = 0.7

/** Folga de altura da chegada: um degrau a mais ou a menos ainda é o mesmo ponto. */
const ARRIVE_HEIGHT_M = 1

/** Quanto a distância tem que encolher para contar como progresso, não como tremor. */
const PROGRESS_EPSILON_M = 0.15

/**
 * Planeja a rota de `from` a `to` e zera o relógio de progresso. Devolve se
 * há caminho.
 *
 * ```ts
 * routeTo(locomotion, graph, nearestNavNode(graph, body.position), destination)
 * ```
 */
export function routeTo(
  locomotion: BotLocomotion,
  graph: NavGraph,
  from: number,
  to: number,
): boolean {
  locomotion.destination = to
  resetProgress(locomotion)
  return planRoute(graph, locomotion.planner, from, to, locomotion.route)
}

function resetProgress(locomotion: BotLocomotion): void {
  locomotion.closestM = Number.POSITIVE_INFINITY
  locomotion.stalledS = 0
}

/** O resultado de um tick de pernas: andando, rota cumprida, ou sem sair do lugar. */
export type LegStatus = 'moving' | 'arrived' | 'stuck'

/**
 * Um tick: avança o cursor se o ponto atual foi alcançado, escreve a direção
 * para o próximo, e mede o progresso. Quem decide o que fazer com `stuck` e
 * com `arrived` é a cabeça do bot (`botMind.ts`), não as pernas.
 *
 * ```ts
 * const status = walkRoute(locomotion, body, graph, config.bots, input, dtS)
 * stepCharacter(body, input, boxes, config, dtS)
 * ```
 */
export function walkRoute(
  locomotion: BotLocomotion,
  body: Readonly<CharacterState>,
  graph: NavGraph,
  bots: BotsConfig,
  into: MutableMovementInput,
  dtS: number,
): LegStatus {
  skipReachedWaypoints(locomotion, body, graph)
  const waypoint = currentWaypoint(locomotion.route)
  if (waypoint < 0) {
    stand(into)
    return 'arrived'
  }
  const target = (graph.nodes[waypoint] as (typeof graph.nodes)[number]).feetM
  steerToward(body, target, legKind(locomotion.route, graph), into)
  return trackProgress(locomotion, horizontalDistanceM(body.position, target), bots, dtS)
}

/** Mais de um por tick quando dois pontos caem no mesmo raio, como o pé e o topo de uma laje. */
function skipReachedWaypoints(
  locomotion: BotLocomotion,
  body: Readonly<CharacterState>,
  graph: NavGraph,
): void {
  const { route } = locomotion
  for (let waypoint = currentWaypoint(route); waypoint >= 0; waypoint = currentWaypoint(route)) {
    const target = (graph.nodes[waypoint] as (typeof graph.nodes)[number]).feetM
    if (!hasReached(body, target)) return
    route.cursor += 1
    resetProgress(locomotion)
  }
}

/**
 * Chegou: perto no chão, na mesma altura e apoiado. Exigir o apoio é o que
 * impede uma queda de contar como chegada quando o bot passa por cima do
 * ponto, ainda no ar.
 */
export function hasReached(body: Readonly<CharacterState>, target: Readonly<Vector3>): boolean {
  if (!body.grounded) return false
  if (Math.abs(body.position.y - target.y) > ARRIVE_HEIGHT_M) return false
  return horizontalDistanceM(body.position, target) <= ARRIVE_RADIUS_M
}

/** O tipo do trecho em curso. O primeiro trecho, até o nó de saída, é sempre andando. */
function legKind(route: Readonly<NavRoute>, graph: NavGraph): NavLinkKind {
  const from = previousWaypoint(route)
  if (from < 0) return 'walk'
  const link = linkBetween(graph, from, currentWaypoint(route))
  return link < 0 ? 'walk' : (graph.links[link] as NavLink).kind
}

/**
 * O comando de um trecho. Andar e cair são o mesmo comando — cair é andar
 * até a borda acabar. Pular é o pulo do jogador: o primeiro no chão, com o
 * alvo acima, e o segundo no alto do primeiro, enquanto o pé não passou do
 * alvo.
 *
 * Sem corrida no pulo: o arco do pulo duplo foi medido contra a corrida base,
 * e correndo o bot passava do topo de uma cobertura estreita.
 */
export function steerToward(
  body: Readonly<CharacterState>,
  target: Readonly<Vector3>,
  kind: NavLinkKind,
  into: MutableMovementInput,
): void {
  const dx = target.x - body.position.x
  const dz = target.z - body.position.z
  const length = Math.sqrt(dx * dx + dz * dz)
  into.wishX = length > 0 ? dx / length : 0
  into.wishZ = length > 0 ? dz / length : 0
  into.sprint = kind !== 'jump'
  into.crouch = false
  into.jump = kind === 'jump' && wantsJump(body, target) && !body.jumpWasHeld
}

/** Um metro abaixo do alvo ainda é "abaixo": é o que separa subir de já estar lá. */
const JUMP_BELOW_TARGET_M = 0.3

/** No alto do arco: subindo devagar o bastante para o segundo impulso render tudo. */
const APEX_RISE_MPS = 1

function wantsJump(body: Readonly<CharacterState>, target: Readonly<Vector3>): boolean {
  if (body.position.y >= target.y - JUMP_BELOW_TARGET_M) return false
  if (body.grounded) return true
  return body.jumpsLeft > 0 && body.velocity.y <= APEX_RISE_MPS
}

function stand(into: MutableMovementInput): void {
  into.wishX = 0
  into.wishZ = 0
  into.sprint = false
  into.jump = false
  into.crouch = false
}

/**
 * Preso é não chegar mais perto do ponto por `stuckAfterS`. Medir distância, e
 * não velocidade, é o que pega o bot que corre contra a parede: ele está a
 * toda velocidade e não sai do lugar.
 */
function trackProgress(
  locomotion: BotLocomotion,
  distanceM: number,
  bots: BotsConfig,
  dtS: number,
): LegStatus {
  if (distanceM < locomotion.closestM - PROGRESS_EPSILON_M) {
    locomotion.closestM = distanceM
    locomotion.stalledS = 0
    locomotion.stuckCount = 0
    return 'moving'
  }
  locomotion.stalledS += dtS
  if (locomotion.stalledS < bots.stuckAfterS) return 'moving'
  locomotion.stalledS = 0
  locomotion.stuckCount += 1
  return 'stuck'
}

export function horizontalDistanceM(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}
