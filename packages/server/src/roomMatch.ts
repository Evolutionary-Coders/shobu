import {
  createMatchCycle,
  leaderPoints,
  type MatchConfig,
  type MatchCycle,
  type MatchCycleEdge,
  type MatchSummaryRow,
  mapReloadHoldS,
  matchPhaseFrozen,
  matchPhaseLeftS,
  matchPhaseScores,
  PAGE_RELOAD_CLOSE_CODE,
  resetRadarState,
  resetScoreboard,
  resetScorestreakLedger,
  restartMatchCycle,
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
    ? room.matchTimeS + mapReloadHoldS(room.match.config)
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
 * if (roomAwaitsReload(room)) this.allowReconnection(client, reloadHoldS(room))
 * ```
 */
export function roomAwaitsReload(room: Pick<RoomSimulation, 'match' | 'matchTimeS'>): boolean {
  return room.match.cycle.phase === 'warmup' && room.matchTimeS < room.match.reloadUntilS
}

/**
 * Quem saiu para a recarga do mapa novo: a vaga fica, e devolve `true` para o
 * adapter guardar a reconexão. Só a saída que a página anuncia com
 * `PAGE_RELOAD_CLOSE_CODE` segura a vaga: foi ela que guardou o token da
 * volta na aba. A queda de rede (1006) no mesmo aquecimento não tem quem a
 * reclame, e segurá-la deixava a vaga vazia, sem bot, até a janela vencer.
 * Fora da janela, ou com outro código, devolve `false`, e a saída segue o
 * caminho de sempre.
 *
 * Longe, o lutador sai de jogo: morto e sem relógio de volta (`stepSeat`).
 * A espera pode passar do aquecimento, e um corpo parado e vivo na partida
 * valendo seria uma kill de graça para quem atira e para os bots — morto, o
 * tiro, o golpe e a mira dos bots já o pulam, sem regra a mais em cada um.
 *
 * ```ts
 * if (holdSeatForReload(room, client.sessionId, code)) this.allowReconnection(client, reloadHoldS(room))
 * ```
 */
export function holdSeatForReload(
  room: RoomSimulation,
  playerId: string,
  closeCode: number | undefined,
): boolean {
  const seat = room.seats.get(playerId)
  if (!seat || closeCode !== PAGE_RELOAD_CLOSE_CODE || !roomAwaitsReload(room)) return false
  seat.away = true
  seat.fighter.alive = false
  seat.fighter.respawnLeftS = 0
  // o ping de antes da recarga é velho, e o tab dos outros o mostrava parado
  // (1005 ms) até a volta: zero é o `--` da coluna, até o cliente relatar de novo.
  seat.pingMs = 0
  return true
}

/**
 * Quanto a vaga de quem caiu agora ainda espera: o que falta da janela que a
 * troca de mapa abriu (`mapReloadHoldS`: o aquecimento e mais
 * `MAP_RELOAD_LIVE_GRACE_S` da partida valendo), e não uma janela cheia
 * contada da queda, por mais tarde no aquecimento que a página caia.
 *
 * A espera passa um pouco do aquecimento de propósito. Cortada nele (no piso
 * de 5 s, ou nos 15 s da reserva), a recarga online que baixa o mapa novo
 * perdia a vaga, e a sala privada só de gente recarregando fechava e reabria
 * pública pelo endereço. Na partida valendo, a vaga longe é um lutador morto
 * (o tiro, o golpe e os bots o pulam) que segura o lugar sem bot, e por isso a
 * folga ali é curta. Quem volta depois disso entra pelo endereço
 * (`requestSeat` cai na entrada quando a reconexão falha), como qualquer um.
 *
 * ```ts
 * this.allowReconnection(client, reloadHoldS(room)) // 21.2
 * ```
 */
export function reloadHoldS(room: Pick<RoomSimulation, 'match' | 'matchTimeS'>): number {
  if (!roomAwaitsReload(room)) return 0
  return room.match.reloadUntilS - room.matchTimeS
}

/**
 * O cliente voltou com o token da reconexão: a vaga é dele de novo, mas a
 * página acabou de recarregar e ainda está no CLIQUE PARA ENTRAR. O lutador
 * segue fora de jogo — morto, o tiro, o golpe e os bots o pulam — até o
 * cliente pegar o controle (`seatTookControl`). Nascer vivo na volta era uma
 * kill de graça na partida valendo, com o jogador ainda olhando a tela de
 * carga.
 *
 * ```ts
 * seatReturned(room, client.sessionId)
 * ```
 */
export function seatReturned(room: RoomSimulation, playerId: string): void {
  const seat = room.seats.get(playerId)
  if (!seat?.away) return
  seat.away = false
  seat.awaitsControl = true
  // a recarga não é inatividade: o tempo longe não conta para a saída.
  forgiveIdleSeat(seat, room.matchTimeS)
}

/**
 * O jogador que voltou da recarga pegou o controle: nasce num spawn sorteado
 * agora, e não na volta, para o spawn ser escolhido longe de quem está vivo
 * neste instante. Para quem não esperava o controle, não faz nada: o cliente
 * avisa a cada vez que sai do menu.
 *
 * ```ts
 * seatTookControl(room, client.sessionId)
 * ```
 */
export function seatTookControl(room: RoomSimulation, playerId: string): void {
  const seat = room.seats.get(playerId)
  if (!seat?.awaitsControl) return
  seat.awaitsControl = false
  respawnSeat(seat, spawnFor(room, room.rules), room.rules)
  seat.fighter.alive = true
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
 * O recomeço, no mapa de agora: placar, séries e radar do zero, todo mundo num
 * spawn, o aquecimento de novo. As séries prontas não passam para a partida
 * nova (o buraco da ADR 0029). O relógio da sala não volta: é o das kills.
 */
function restartRoomMatch(room: RoomSimulation): void {
  respawnRoom(room, room.rules)
  resetScoreboard(room.board)
  resetScorestreakLedger(room.scorestreaks.ledger)
  room.scorestreaks.pending.clear()
  // o PING acionado no fim da partida não varre o aquecimento da seguinte.
  resetRadarState(room.scorestreaks.radar)
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
 * assento de quem recarrega a página conta: a vaga é dele até a volta, e o
 * colyseus a conta reservada na lotação, então mandar alguém para ela só
 * faria a entrada falhar (ADR 0031).
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
