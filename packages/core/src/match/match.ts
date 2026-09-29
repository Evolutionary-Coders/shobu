import type { StaticBox } from '../collision/staticBox.ts'
import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { Vector3 } from '../math/vector3.ts'
import { type CharacterState, createCharacterState } from '../movement/characterState.ts'
import { IDLE_INPUT, type MovementInput } from '../movement/movementInput.ts'
import { stepCharacter } from '../movement/stepCharacter.ts'

/**
 * Um jogador numa partida de vários: o personagem e o último input que chegou
 * dele. O último input vale até chegar outro, porque um input atrasado na rede
 * não pode fazer o personagem parar no servidor enquanto segue andando na
 * predição do cliente.
 */
export interface MatchPlayer {
  readonly playerId: string
  readonly character: CharacterState
  input: MovementInput
}

/**
 * A partida no núcleo, sem rede: é o que o servidor de jogo autoriza e o que a
 * predição do cliente repete. Ordem de inserção no mapa é ordem de entrada.
 */
export interface Match {
  readonly players: Map<string, MatchPlayer>
  tick: number
}

export function createMatch(): Match {
  return { players: new Map(), tick: 0 }
}

/**
 * ```ts
 * joinMatch(match, sessionId, { x: 26, y: 0.2, z: 26 }, config)
 * ```
 */
export function joinMatch(
  match: Match,
  playerId: string,
  feetM: Readonly<Vector3>,
  config: GameplayConfig,
): MatchPlayer {
  if (match.players.has(playerId)) {
    throw new Error(`joinMatch recebeu '${playerId}', que já está na partida; esperado id novo`)
  }
  const player: MatchPlayer = {
    playerId,
    character: createCharacterState(feetM, config),
    input: IDLE_INPUT,
  }
  match.players.set(playerId, player)
  return player
}

export function leaveMatch(match: Match, playerId: string): void {
  match.players.delete(playerId)
}

export function setPlayerInput(match: Match, playerId: string, input: MovementInput): void {
  const player = match.players.get(playerId)
  if (!player) {
    throw new Error(`setPlayerInput recebeu '${playerId}', que não está na partida`)
  }
  player.input = input
}

/**
 * Um tick da partida: cada jogador avança com o próprio input.
 *
 * ```ts
 * stepMatch(match, arenaBoxes, config)
 * ```
 */
export function stepMatch(match: Match, boxes: readonly StaticBox[], config: GameplayConfig): void {
  const dtS = 1 / config.simulation.tickHz
  for (const player of match.players.values()) {
    stepCharacter(player.character, player.input, boxes, config, dtS)
  }
  match.tick += 1
}
