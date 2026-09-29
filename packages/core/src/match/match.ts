import type { StaticBox } from '../collision/staticBox.ts'
import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { Vector3 } from '../math/vector3.ts'
import { type CharacterState, createCharacterState } from '../movement/characterState.ts'
import type { MovementInput } from '../movement/movementInput.ts'
import { stepCharacter } from '../movement/stepCharacter.ts'

/** Um jogador numa partida de vários. */
export interface MatchPlayer {
  readonly playerId: string
  readonly character: CharacterState
}

/**
 * A partida no núcleo, sem rede: é o que o servidor de jogo autoriza e o que a
 * predição do cliente repete. Ordem de inserção no mapa é ordem de entrada.
 *
 * A partida é guiada por input, não por relógio: cada input de um jogador é um
 * tick daquele jogador. É o que faz "o servidor aplicou N inputs" e "o cliente
 * simulou N inputs" darem o mesmo estado, e a reconciliação do cliente depende
 * disso. Quem decide quantos inputs cabem num tick do servidor é a sala.
 */
export interface Match {
  readonly players: Map<string, MatchPlayer>
}

export function createMatch(): Match {
  return { players: new Map() }
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
  const player: MatchPlayer = { playerId, character: createCharacterState(feetM, config) }
  match.players.set(playerId, player)
  return player
}

export function leaveMatch(match: Match, playerId: string): void {
  match.players.delete(playerId)
}

/**
 * Um input de um jogador: um tick do personagem dele.
 *
 * ```ts
 * stepMatchPlayer(match, sessionId, decodeMovementInput(wire, false), arenaBoxes, config)
 * ```
 */
export function stepMatchPlayer(
  match: Match,
  playerId: string,
  input: MovementInput,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
): void {
  const player = match.players.get(playerId)
  if (!player) {
    throw new Error(`stepMatchPlayer recebeu '${playerId}', que não está na partida`)
  }
  stepCharacter(player.character, input, boxes, config, 1 / config.simulation.tickHz)
}
