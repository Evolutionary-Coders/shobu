import {
  createMatchCycle,
  leaderPoints,
  type MatchConfig,
  type MatchCycle,
  type MatchCycleEdge,
  type MatchSummaryRow,
  matchPhaseFrozen,
  matchPhaseLeftS,
  matchPhaseScores,
  resetScoreboard,
  resetScorestreakLedger,
  restartMatchCycle,
  SEAT_RESERVATION_S,
  scoreLimitReached,
  stepMatchCycle,
  summarizeMatch,
} from '@shobu/core'
import type { RoomStanding } from './quickMatch.ts'
import { forgiveIdleSeat, forgiveIdleSeats } from './roomAfk.ts'
import { respawnRoom, switchRoomArena } from './roomRestart.ts'
import { respawnSeat } from './roomSeat.ts'
import { type RoomIo, type RoomRules, type RoomSimulation, spawnFor } from './roomSimulation.ts'
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
  live: (room) => forgiveIdleSeats(room),
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
  const nextRules = votedRules(room)
  const mapChanged = nextRules !== undefined && nextRules !== room.rules
  if (mapChanged) switchRoomArena(room, nextRules)
  restartRoomMatch(room)
  room.match.reloadUntilS = mapChanged
    ? room.matchTimeS + SEAT_RESERVATION_S
    : Number.NEGATIVE_INFINITY
  io.onNextMatch(room.rules.arenaId, mapChanged)
}

/** As regras do mapa que o voto fechou, se ele está no catálogo da sala. */
function votedRules(room: Pick<RoomSimulation, 'match' | 'arenas'>): RoomRules | undefined {
  const mapId = room.match.vote?.outcome?.mapId
  return mapId === undefined ? undefined : room.arenas.get(mapId)
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
 * Quem caiu na recarga do mapa novo: a vaga fica, e devolve `true` para o
 * adapter guardar a reconexão. Fora da janela, devolve `false`, e a saída
 * segue o caminho de sempre.
 *
 * Longe, o lutador sai de jogo: morto e sem relógio de volta (`stepSeat`).
 * A espera pode passar do aquecimento, e um corpo parado e vivo na partida
 * valendo seria uma kill de graça para quem atira e para os bots — morto, o
 * tiro, o golpe e a mira dos bots já o pulam, sem regra a mais em cada um.
 *
 * ```ts
 * if (holdSeatForReload(room, client.sessionId)) this.allowReconnection(client, reloadHoldS(room))
 * ```
 */
export function holdSeatForReload(room: RoomSimulation, playerId: string): boolean {
  const seat = room.seats.get(playerId)
  if (!seat || !roomAwaitsReload(room)) return false
  seat.away = true
  seat.fighter.alive = false
  seat.fighter.respawnLeftS = 0
  return true
}

/**
 * Quanto a vaga de quem caiu agora ainda espera: o que falta da reserva que
 * a troca de mapa abriu, e não uma reserva cheia contada da queda, e nunca
 * além do aquecimento. Assim a vaga vazia nunca segura a sala além de
 * `SEAT_RESERVATION_S` da troca, por mais tarde no aquecimento que a página
 * caia, e não entra na partida valendo: ali ela conta como gente na sala e
 * nenhum bot senta no lugar (o assento longe ainda é assento, `botSeatsFor`).
 * Com o aquecimento no piso de 5 s, a vaga ficava uns 10 s da partida vazia.
 * Quem volta depois disso entra de novo pelo endereço (`requestSeat` cai na
 * entrada quando a reconexão falha) e toma a vaga de um bot, como qualquer um.
 *
 * ```ts
 * this.allowReconnection(client, reloadHoldS(room)) // 11.2
 * ```
 */
export function reloadHoldS(room: Pick<RoomSimulation, 'match' | 'matchTimeS'>): number {
  if (!roomAwaitsReload(room)) return 0
  const reservationLeftS = room.match.reloadUntilS - room.matchTimeS
  return Math.min(reservationLeftS, matchPhaseLeftS(room.match.cycle, room.match.config))
}

/**
 * O cliente voltou com o token da reconexão: a vaga é dele de novo, num
 * spawn sorteado, vivo — longe ele estava fora de jogo (`holdSeatForReload`).
 *
 * ```ts
 * seatReturned(room, client.sessionId)
 * ```
 */
export function seatReturned(room: RoomSimulation, playerId: string): void {
  const seat = room.seats.get(playerId)
  if (!seat?.away) return
  seat.away = false
  respawnSeat(seat, spawnFor(room, room.rules), room.rules)
  seat.fighter.alive = true
  // a recarga não é inatividade: o tempo longe não conta para a saída.
  forgiveIdleSeat(seat, room.matchTimeS)
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
 * O resumo para quem entra no intervalo: a fase, o tempo e o voto já vêm no
 * estado da sala, e o resumo, que é mensagem, chega só para ele. Fora do
 * intervalo não há resumo a mandar.
 *
 * ```ts
 * const rows = summaryForJoiner(room)
 * if (rows) client.send(MATCH_SUMMARY_MESSAGE, { rows })
 * ```
 */
export function summaryForJoiner(
  room: Pick<RoomSimulation, 'match'>,
): readonly MatchSummaryRow[] | undefined {
  return matchPhaseFrozen(room.match.cycle) ? room.match.summary : undefined
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

/**
 * A situação da sala para a partida rápida (ADR 0032): quantos assentos de
 * gente, a fase e quanto falta nela, e o mapa em que quem entra vai jogar. O
 * assento de quem recarrega a página conta: a vaga é dele até a volta.
 *
 * Com o voto fechado (`decided`), o mapa é o que o voto escolheu, e não o de
 * agora: a sala sai dele em segundos, e quem entrasse subiria um mapa só para
 * recarregar no outro logo depois.
 *
 * ```ts
 * roomStandingOf(room) // { humans: 2, phase: 'live', phaseLeftS: 187.5, arenaId: 'neon-kaido' }
 * ```
 */
export function roomStandingOf(
  room: Pick<RoomSimulation, 'seats' | 'match' | 'rules' | 'arenas'>,
): RoomStanding {
  const { cycle } = room.match
  const upcoming = cycle.phase === 'decided' ? votedRules(room) : undefined
  return {
    humans: room.seats.size,
    phase: cycle.phase,
    phaseLeftS: matchPhaseLeftS(cycle, room.match.config),
    arenaId: (upcoming ?? room.rules).arenaId,
  }
}
