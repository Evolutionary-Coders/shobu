import {
  createMatchCycle,
  leaderPoints,
  type MatchConfig,
  type MatchCycle,
  type MatchCycleEdge,
  type MatchSummaryRow,
  matchPhaseScores,
  resetScoreboard,
  resetScorestreakLedger,
  restartMatchCycle,
  SEAT_RESERVATION_S,
  scoreLimitReached,
  stepMatchCycle,
  summarizeMatch,
} from '@shobu/core'
import { respawnRoom, switchRoomArena } from './roomRestart.ts'
import type { RoomIo, RoomRules, RoomSimulation } from './roomSimulation.ts'
import { closeRoomVote, openRoomVote, type RoomVote } from './roomVote.ts'

/**
 * A partida da sala, do aquecimento ao voto (ADR 0031). O relógio é este, e
 * não o `matchTimeS` da sala: aquele só cresce, porque as kills e as janelas
 * de multikill o leem como instante, e voltar a zero no meio da sala faria a
 * primeira kill da partida nova cair na janela das últimas da anterior.
 */
export interface RoomMatch {
  readonly cycle: MatchCycle
  /** As durações das fases e o limite de pontos, os mesmos em todo mapa. */
  readonly config: MatchConfig
  /** Quantas partidas a sala já jogou: a semente do voto muda de uma para outra. */
  serial: number
  /**
   * O resumo da partida que acabou, do MVP ao último: sai no fim e fica até a
   * partida seguinte, para quem entra no intervalo também recebê-lo.
   */
  summary: readonly MatchSummaryRow[] | undefined
  /** O voto do próximo mapa: abre na tela de resultado e fica até a partida seguinte. */
  vote: RoomVote | undefined
  /**
   * Até quando, no relógio da sala, a vaga de quem cai espera a volta: a
   * página recarrega no mapa que o voto trocou. `-Infinity` sem troca.
   */
  reloadUntilS: number
}

/** Por que a partida acabou: o relógio zerou ou o líder chegou ao limite de pontos. */
export type MatchEndReason = 'time' | 'score'

/**
 * A partida de uma sala recém-aberta: com relógio e com aquecimento, porque
 * quem abriu a sala ainda espera os outros entrarem.
 *
 * ```ts
 * const match = createRoomMatch(config.match)
 * ```
 */
export function createRoomMatch(config: MatchConfig): RoomMatch {
  return {
    cycle: createMatchCycle({ warmup: true, timed: true }),
    config,
    serial: 0,
    summary: undefined,
    vote: undefined,
    reloadUntilS: Number.NEGATIVE_INFINITY,
  }
}

/**
 * Um tick do relógio da partida, com o placar oficial decidindo o limite de
 * pontos. A borda vai para o log (`onMatchEdge`) e para quem cuida dela;
 * congelar é ler a fase (`matchPhaseFrozen`), e não precisa de ação aqui.
 *
 * ```ts
 * stepRoomMatch(room, io, rules) // 'over' quando o relógio zera
 * ```
 */
export function stepRoomMatch(
  room: RoomSimulation,
  io: RoomIo,
  rules: RoomRules,
): MatchCycleEdge | undefined {
  const dtS = 1 / rules.config.simulation.tickHz
  const leader = leaderPoints(room.board)
  const edge = stepMatchCycle(room.match.cycle, dtS, leader, room.match.config)
  if (!edge) return undefined
  io.onMatchEdge(edge)
  EDGE_ACTIONS[edge](room, io, leader)
  return edge
}

/** O que cada borda faz na sala, além de ir para o log. */
const EDGE_ACTIONS: Readonly<
  Record<MatchCycleEdge, (room: RoomSimulation, io: RoomIo, leader: number) => void>
> = {
  live: () => undefined,
  over: (room, io, leader) => endRoomMatch(room, io, scoreLimitReached(leader, room.match.config)),
  results: (room) => {
    room.match.vote = openRoomVote(room)
  },
  decided: (room) => {
    closeRoomVote(room)
  },
  next: (room, io) => nextRoomMatch(room, io),
}

/**
 * A partida seguinte, no mapa que o voto escolheu: troca o mapa só se for
 * outro, e recomeça. Sem voto fechado, fica no mesmo mapa.
 */
function nextRoomMatch(room: RoomSimulation, io: RoomIo): void {
  const mapId = room.match.vote?.outcome?.mapId
  const nextRules = mapId === undefined ? undefined : room.arenas.get(mapId)
  const mapChanged = nextRules !== undefined && nextRules !== room.rules
  if (mapChanged) switchRoomArena(room, nextRules)
  restartRoomMatch(room)
  room.match.reloadUntilS = mapChanged
    ? room.matchTimeS + SEAT_RESERVATION_S
    : Number.NEGATIVE_INFINITY
  io.onNextMatch(room.rules.arenaId, mapChanged)
}

/**
 * Se a vaga de quem cai espera a volta: no aquecimento logo depois de o voto
 * trocar o mapa, quando o cliente recarrega a página para subir o mapa novo.
 * Fora disso, cair é sair, como sempre foi (ADR 0031).
 *
 * ```ts
 * if (roomAwaitsReload(room)) this.allowReconnection(client, SEAT_RESERVATION_S)
 * ```
 */
export function roomAwaitsReload(room: Pick<RoomSimulation, 'match' | 'matchTimeS'>): boolean {
  return room.match.cycle.phase === 'warmup' && room.matchTimeS < room.match.reloadUntilS
}

/**
 * Quem caiu na recarga do mapa novo: a vaga fica, parada, e devolve `true`
 * para o adapter guardar a reconexão. Fora da janela, devolve `false`, e a
 * saída segue o caminho de sempre.
 *
 * ```ts
 * if (holdSeatForReload(room, client.sessionId)) this.allowReconnection(client, SEAT_RESERVATION_S)
 * ```
 */
export function holdSeatForReload(room: RoomSimulation, playerId: string): boolean {
  const seat = room.seats.get(playerId)
  if (!seat || !roomAwaitsReload(room)) return false
  seat.away = true
  return true
}

/**
 * O cliente voltou com o token da reconexão: a vaga é dele de novo.
 *
 * ```ts
 * seatReturned(room, client.sessionId)
 * ```
 */
export function seatReturned(room: RoomSimulation, playerId: string): void {
  const seat = room.seats.get(playerId)
  if (seat) seat.away = false
}

/**
 * O fim da partida: o resumo sai do placar oficial, para todos, e o pedido de
 * série que ainda esperava o tick se perde — a arena congelou.
 */
function endRoomMatch(room: RoomSimulation, io: RoomIo, byScore: boolean): void {
  room.match.summary = summarizeMatch(room.board)
  room.scorestreaks.pending.clear()
  io.onMatchSummary(room.match.summary, byScore ? 'score' : 'time')
}

/**
 * O recomeço, no mapa de agora: placar e séries do zero, todo mundo num
 * spawn, o aquecimento de novo. As séries prontas não passam para a partida
 * nova (o buraco da ADR 0029). O relógio da sala não volta: é o das kills.
 */
function restartRoomMatch(room: RoomSimulation): void {
  respawnRoom(room, room.rules)
  resetScoreboard(room.board)
  resetScorestreakLedger(room.scorestreaks.ledger)
  room.scorestreaks.pending.clear()
  room.match.serial += 1
  room.match.summary = undefined
  room.match.vote = undefined
  restartMatchCycle(room.match.cycle, true)
}

/**
 * Se a kill vale agora: só com a partida em andamento. No aquecimento o tiro
 * e o golpe saem e o rastro vai para todos, mas ninguém morre.
 *
 * ```ts
 * if (!victim || !roomScores(room)) return
 * ```
 */
export function roomScores(room: Pick<RoomSimulation, 'match'>): boolean {
  return matchPhaseScores(room.match.cycle)
}
