import {
  activateScorestreak,
  addPlayer,
  applyBoundaryDeath,
  type BotPlayer,
  createScoreboard,
  createScorestreakLedger,
  creditScorestreakKill,
  DEFAULT_SCORESTREAK_LOADOUT,
  dropScorestreaks,
  enlistScorestreaks,
  forgetScorestreakDeath,
  type KillEvent,
  MATCH_SEED_BASE,
  type MedalAward,
  parseScorestreakLoadout,
  pickBotScorestreaks,
  recordKill,
  removePlayer,
  SCORESTREAK_SLOT_COUNT,
  type Scoreboard,
  type ScorestreakLedger,
  type ScorestreakNotice,
  type ScorestreakSlug,
} from '@shobu/core'
import type { RoomIo, RoomRules, RoomSimulation } from './roomSimulation.ts'

/**
 * As séries de pontuação da sala (ADR 0029). O servidor é quem decide o que
 * se ganha e o que se gasta: para isso ele pontua as kills num placar próprio,
 * com o mesmo `recordKill` dos clientes. O placar daqui só paga séries; o tab
 * de cada cliente continua pontuando a lista de kills sozinho.
 */
export interface RoomScorestreaks {
  readonly board: Scoreboard
  readonly ledger: ScorestreakLedger
  /** Rascunho de `recordKill`: as medalhas somam pontos, mas ninguém as lê aqui. */
  readonly medals: MedalAward[]
  readonly notices: ScorestreakNotice[]
  /**
   * O slot que cada jogador pediu desde o último tick. O pedido chega pela
   * rede entre ticks, e só é decidido no tick, com o lutador já andado: um
   * pedido de morto não aciona nada.
   */
  readonly pending: Map<string, number>
}

/**
 * O placar e o livro da sala, com cada bot já inscrito — no banco também,
 * para a vaga que senta depois não chegar sem séries. A semente é a da
 * partida, a mesma do cliente offline: a mesma vaga leva as mesmas séries.
 *
 * ```ts
 * const scorestreaks = createRoomScorestreaks(bots.squad.bots)
 * ```
 */
export function createRoomScorestreaks(bots: readonly BotPlayer[]): RoomScorestreaks {
  const room: RoomScorestreaks = {
    board: createScoreboard(),
    ledger: createScorestreakLedger(),
    medals: [],
    notices: [],
    pending: new Map(),
  }
  for (const [botIndex, bot] of bots.entries()) {
    addPlayer(room.board, bot.id)
    enlistScorestreaks(room.ledger, bot.id, pickBotScorestreaks(MATCH_SEED_BASE, botIndex), true)
  }
  return room
}

/**
 * Quem entra pontua do zero, com as séries padrão até o cliente mandar as dele.
 *
 * ```ts
 * enlistSeatScorestreaks(room, client.sessionId)
 * ```
 */
export function enlistSeatScorestreaks(room: RoomSimulation, playerId: string): void {
  addPlayer(room.scorestreaks.board, playerId)
  enlistScorestreaks(room.scorestreaks.ledger, playerId, DEFAULT_SCORESTREAK_LOADOUT)
}

/**
 * Quem sai leva o placar, as séries e o pedido que ainda não foi decidido.
 *
 * ```ts
 * dropSeatScorestreaks(room, client.sessionId)
 * ```
 */
export function dropSeatScorestreaks(room: RoomSimulation, playerId: string): void {
  removePlayer(room.scorestreaks.board, playerId)
  dropScorestreaks(room.scorestreaks.ledger, playerId)
  room.scorestreaks.pending.delete(playerId)
}

/**
 * As séries que o cliente escolheu (`SCORESTREAK_LOADOUT_MESSAGE`). Vem da
 * rede: o que não é escolha válida é recusado e devolve `false`, para o
 * adapter registrar. A mesma escolha não mexe em nada. Uma escolha nova no
 * meio de uma vida com pontos chega com a vida já gasta: sem isso, reenviar a
 * escolha zeraria `earnedThisLife` e a série já acionada sairia de novo.
 *
 * ```ts
 * if (!chooseScorestreaks(room, client.sessionId, message?.scorestreaks)) log(...)
 * ```
 */
export function chooseScorestreaks(room: RoomSimulation, playerId: string, raw: unknown): boolean {
  const { ledger, board } = room.scorestreaks
  const current = ledger.slotsById.get(playerId)
  if (!current) return false
  const loadout = parseLoadoutOrUndefined(raw)
  if (!loadout) return false
  if (sameLoadout(current.loadout, loadout)) return true
  const slots = enlistScorestreaks(ledger, playerId, loadout)
  if (addPlayer(board, playerId).scorestreakPoints > 0) slots.earnedThisLife.fill(true)
  return true
}

function parseLoadoutOrUndefined(raw: unknown): readonly ScorestreakSlug[] | undefined {
  try {
    return parseScorestreakLoadout(raw)
  } catch {
    return undefined
  }
}

function sameLoadout(
  current: readonly ScorestreakSlug[],
  chosen: readonly ScorestreakSlug[],
): boolean {
  return current.every((slug, index) => chosen[index] === slug)
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
 * Uma kill da sala: pontua no placar do servidor, decide as séries, avisa a
 * kill a todos e depois as séries — o cliente lê a kill antes do aviso dela.
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
  const { board, ledger, medals, notices } = room.scorestreaks
  medals.length = 0
  recordKill(board, kill, rules.config, medals)
  creditScorestreakKill(ledger, board, kill, rules.config.scorestreaks, notices)
  io.onKill(kill)
  flushScorestreakNotices(room, io)
}

/**
 * A morte pela borda: zera os pontos da vida, e a série guardada continua.
 *
 * ```ts
 * scoreRoomBoundaryDeath(room, io, seat.fighter.id)
 * ```
 */
export function scoreRoomBoundaryDeath(room: RoomSimulation, io: RoomIo, playerId: string): void {
  applyBoundaryDeath(room.scorestreaks.board, playerId)
  forgetScorestreakDeath(room.scorestreaks.ledger, playerId)
  io.onBoundaryDeath(playerId)
}

/**
 * O fim do tick: decide os pedidos que chegaram. Só o vivo aciona; o pedido
 * de quem morreu se perde, e não fica esperando o respawn.
 *
 * ```ts
 * stepRoomScorestreaks(room, io)
 * ```
 */
export function stepRoomScorestreaks(room: RoomSimulation, io: RoomIo): void {
  const { ledger, pending, notices } = room.scorestreaks
  for (const [playerId, slot] of pending) {
    if (room.seats.get(playerId)?.fighter.alive)
      activateScorestreak(ledger, playerId, slot, notices)
  }
  pending.clear()
  flushScorestreakNotices(room, io)
}

/** O ganho só para o dono; o acionamento para todos. */
function flushScorestreakNotices(room: RoomSimulation, io: RoomIo): void {
  const { notices } = room.scorestreaks
  for (const { kind, playerId, slot, scorestreak } of notices) {
    if (kind === 'earned') io.onScorestreakEarned(playerId, { slot, scorestreak })
    else io.onScorestreakActivated({ playerId, slot, scorestreak })
  }
  notices.length = 0
}
