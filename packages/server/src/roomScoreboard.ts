import {
  addPlayer,
  applyBoundaryDeath,
  type KillEvent,
  recordKill,
  removePlayer,
} from '@shobu/core'
import {
  creditRoomScorestreakKill,
  flushScorestreakNotices,
  forgetRoomScorestreakDeath,
} from './roomScorestreaks.ts'
import type { RoomIo, RoomRules, RoomSimulation } from './roomSimulation.ts'

/**
 * O placar oficial da sala (ADR 0031): um só, o que paga as séries, decide o
 * limite de pontos e o MVP e vai no estado para o tab de cada cliente. Antes
 * ele morava nas séries e só pagava série; os clientes contavam o deles.
 */

/**
 * Quem entra pontua do zero; quem sai leva a linha dele.
 *
 * ```ts
 * seatRoomScore(room, client.sessionId)
 * ```
 */
export function seatRoomScore(room: Pick<RoomSimulation, 'board'>, playerId: string): void {
  addPlayer(room.board, playerId)
}

/** Quem sai leva a linha do placar. */
export function unseatRoomScore(room: Pick<RoomSimulation, 'board'>, playerId: string): void {
  removePlayer(room.board, playerId)
}

/**
 * Uma kill da sala: pontua no placar oficial, decide as séries, avisa a kill
 * a todos e depois as séries — o cliente lê a kill antes do aviso dela.
 *
 * ```ts
 * scoreRoomKill(room, io, describeRoomKill(...), rules)
 * ```
 */
export function scoreRoomKill(
  room: RoomSimulation,
  io: RoomIo,
  kill: Readonly<KillEvent>,
  rules: RoomRules,
): void {
  room.medals.length = 0
  recordKill(room.board, kill, rules.config, room.medals)
  creditRoomScorestreakKill(room, kill, rules)
  io.onKill(kill)
  flushScorestreakNotices(room, io)
}

/**
 * A morte pela borda: conta a morte, zera os pontos da vida, e a série
 * guardada continua.
 *
 * ```ts
 * scoreRoomBoundaryDeath(room, io, seat.fighter.id)
 * ```
 */
export function scoreRoomBoundaryDeath(room: RoomSimulation, io: RoomIo, playerId: string): void {
  applyBoundaryDeath(room.board, playerId)
  forgetRoomScorestreakDeath(room, playerId)
  io.onBoundaryDeath(playerId)
}
