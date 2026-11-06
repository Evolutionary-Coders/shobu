import {
  activateScorestreak,
  addPlayer,
  applyRadarActivation,
  createRadarState,
  createScorestreakLedger,
  creditScorestreakKill,
  DEFAULT_SCORESTREAK_LOADOUT,
  dropScorestreaks,
  enlistScorestreaks,
  forgetScorestreakDeath,
  type KillEvent,
  MATCH_SEED_BASE,
  parseScorestreakLoadout,
  pickBotScorestreaks,
  type RadarState,
  type RadarSweep,
  rechooseScorestreaks,
  SCORESTREAK_SLOT_COUNT,
  type ScorestreakLedger,
  type ScorestreakNotice,
  type ScorestreakSlug,
} from '@shobu/core'
import { roomScores } from './roomMatch.ts'
import type { RoomIo, RoomRules, RoomSimulation } from './roomSimulation.ts'

/**
 * As séries de pontuação da sala (ADR 0029). O servidor é quem decide o que
 * se ganha e o que se gasta, lendo os pontos da vida no placar oficial da
 * sala (`roomScoreboard.ts`, ADR 0031); aqui fica só o livro das séries.
 */
export interface RoomScorestreaks {
  readonly ledger: ScorestreakLedger
  readonly notices: ScorestreakNotice[]
  /**
   * O slot que cada jogador pediu desde o último tick. O pedido chega pela
   * rede entre ticks, e só é decidido no tick, com o lutador já andado: um
   * pedido de morto não aciona nada.
   */
  readonly pending: Map<string, number>
  /** Os PINGs rodando (ADR 0035), que o acionamento começa. */
  readonly radar: RadarState
  /** Rascunho de `stepRadarPulses`, reaproveitado a cada tick. */
  readonly sweeps: RadarSweep[]
}

/**
 * O livro de uma sala nova, ainda vazio: quem inscreve cada bot sentado é
 * `syncBenchedBotRecords` (`roomBots.ts`), e o do banco fica fora do livro.
 *
 * ```ts
 * const scorestreaks = createRoomScorestreaks()
 * ```
 */
export function createRoomScorestreaks(): RoomScorestreaks {
  return {
    ledger: createScorestreakLedger(),
    notices: [],
    pending: new Map(),
    radar: createRadarState(),
    sweeps: [],
  }
}

/**
 * O bot que senta, com as séries da vaga dele. A semente é a da partida, a
 * mesma do cliente offline: a mesma vaga leva as mesmas séries, e o bot
 * aciona cada uma assim que a ganha.
 *
 * ```ts
 * enlistRoomBotScorestreaks(room, bot.id, botIndex)
 * ```
 */
export function enlistRoomBotScorestreaks(
  room: RoomSimulation,
  botId: string,
  botIndex: number,
): void {
  enlistScorestreaks(
    room.scorestreaks.ledger,
    botId,
    pickBotScorestreaks(MATCH_SEED_BASE, botIndex),
    true,
  )
}

/**
 * Quem entra tem as séries padrão até o cliente mandar as dele.
 *
 * ```ts
 * enlistSeatScorestreaks(room, client.sessionId)
 * ```
 */
export function enlistSeatScorestreaks(room: RoomSimulation, playerId: string): void {
  enlistScorestreaks(room.scorestreaks.ledger, playerId, DEFAULT_SCORESTREAK_LOADOUT)
}

/**
 * Quem sai leva as séries e o pedido que ainda não foi decidido.
 *
 * ```ts
 * dropSeatScorestreaks(room, client.sessionId)
 * ```
 */
export function dropSeatScorestreaks(room: RoomSimulation, playerId: string): void {
  dropScorestreaks(room.scorestreaks.ledger, playerId)
  room.scorestreaks.pending.delete(playerId)
}

/**
 * As séries que o cliente escolheu (`SCORESTREAK_LOADOUT_MESSAGE`). Vem da
 * rede: o que não é escolha válida é recusado e devolve `false`, para o
 * adapter registrar. A troca no meio da partida guarda o estado de cada série
 * que continua na escolha (`rechooseScorestreaks`).
 *
 * ```ts
 * if (!chooseScorestreaks(room, client.sessionId, message?.scorestreaks)) log(...)
 * ```
 */
export function chooseScorestreaks(room: RoomSimulation, playerId: string, raw: unknown): boolean {
  const { ledger } = room.scorestreaks
  if (!ledger.slotsById.has(playerId)) return false
  const loadout = parseLoadoutOrUndefined(raw)
  if (!loadout) return false
  rechooseScorestreaks(ledger, playerId, loadout, addPlayer(room.board, playerId).scorestreakPoints)
  return true
}

function parseLoadoutOrUndefined(raw: unknown): readonly ScorestreakSlug[] | undefined {
  try {
    return parseScorestreakLoadout(raw)
  } catch {
    return undefined
  }
}

/**
 * O pedido de acionar uma série (`SCORESTREAK_ACTIVATE_MESSAGE`). Vem da
 * rede: só um slot inteiro da faixa, de quem está na sala, entra na fila do
 * próximo tick (`stepRoomScorestreaks`).
 *
 * ```ts
 * requestScorestreak(room, client.sessionId, message?.slot)
 * ```
 */
export function requestScorestreak(room: RoomSimulation, playerId: string, slot: unknown): void {
  if (!room.seats.has(playerId)) return
  if (!Number.isInteger(slot)) return
  const index = slot as number
  if (index < 0 || index >= SCORESTREAK_SLOT_COUNT) return
  room.scorestreaks.pending.set(playerId, index)
}

/**
 * As séries que a kill paga, lidas do placar oficial, que `scoreRoomKill` já
 * pontuou. Os avisos ficam na fila até `flushScorestreakNotices`.
 *
 * ```ts
 * creditRoomScorestreakKill(room, kill, rules)
 * ```
 */
export function creditRoomScorestreakKill(
  room: RoomSimulation,
  kill: Readonly<KillEvent>,
  rules: RoomRules,
): void {
  const { ledger, notices } = room.scorestreaks
  creditScorestreakKill(ledger, room.board, kill, rules.config.scorestreaks, notices)
}

/**
 * A morte pela borda zera o que a vida ganhou; a série guardada continua.
 *
 * ```ts
 * forgetRoomScorestreakDeath(room, seat.fighter.id)
 * ```
 */
export function forgetRoomScorestreakDeath(room: RoomSimulation, playerId: string): void {
  forgetScorestreakDeath(room.scorestreaks.ledger, playerId)
}

/**
 * O fim do tick: decide os pedidos que chegaram. Só o vivo aciona, e só com a
 * partida valendo; o pedido de quem morreu, ou o do aquecimento e do
 * intervalo, se perde, e não fica esperando.
 *
 * ```ts
 * stepRoomScorestreaks(room, io)
 * ```
 */
export function stepRoomScorestreaks(room: RoomSimulation, io: RoomIo): void {
  const { ledger, pending, notices } = room.scorestreaks
  if (!roomScores(room)) {
    pending.clear()
    return
  }
  for (const [playerId, slot] of pending) {
    if (room.seats.get(playerId)?.fighter.alive)
      activateScorestreak(ledger, playerId, slot, notices)
  }
  pending.clear()
  flushScorestreakNotices(room, io)
}

/**
 * O ganho só para o dono; o acionamento para todos, e no radar da sala: é
 * aqui que o PING começa a varrer, o do jogador e o que o bot gasta sozinho
 * ao ganhar (`creditScorestreakKill`).
 *
 * ```ts
 * flushScorestreakNotices(room, io)
 * ```
 */
export function flushScorestreakNotices(room: RoomSimulation, io: RoomIo): void {
  const { notices, radar } = room.scorestreaks
  for (const notice of notices) {
    const { kind, playerId, slot, scorestreak } = notice
    if (kind === 'earned') io.onScorestreakEarned(playerId, { slot, scorestreak })
    else io.onScorestreakActivated({ playerId, slot, scorestreak })
    applyRadarActivation(radar, notice, room.matchTimeS, room.rules.config.radar)
  }
  notices.length = 0
}
