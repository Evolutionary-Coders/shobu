import {
  createMatchCycle,
  leaderPoints,
  type MatchConfig,
  type MatchCycle,
  type MatchCycleEdge,
  matchPhaseScores,
  resetScoreboard,
  resetScorestreakLedger,
  restartMatchCycle,
  stepMatchCycle,
} from '@shobu/core'
import type { RoomIo, RoomRules, RoomSimulation } from './roomSimulation.ts'

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
}

/**
 * A partida de uma sala recém-aberta: com relógio e com aquecimento, porque
 * quem abriu a sala ainda espera os outros entrarem.
 *
 * ```ts
 * const match = createRoomMatch(config.match)
 * ```
 */
export function createRoomMatch(config: MatchConfig): RoomMatch {
  return { cycle: createMatchCycle({ warmup: true, timed: true }), config, serial: 0 }
}

/**
 * Um tick do relógio da partida, com o placar do servidor decidindo o limite
 * de pontos. A borda vai para o log (`onMatchEdge`); congelar é ler a fase
 * (`matchPhaseFrozen`), e não precisa de ação aqui.
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
  const leader = leaderPoints(room.scorestreaks.board)
  const edge = stepMatchCycle(room.match.cycle, dtS, leader, room.match.config)
  if (!edge) return undefined
  io.onMatchEdge(edge)
  if (edge === 'next') restartRoomMatch(room)
  return edge
}

/**
 * A partida seguinte no mesmo mapa: placar e séries do zero, o aquecimento de
 * novo. As séries prontas não passam para a partida nova (o buraco da ADR
 * 0029). ponytail: o voto e a troca de mapa entram no lugar deste recomeço.
 */
function restartRoomMatch(room: RoomSimulation): void {
  resetScoreboard(room.scorestreaks.board)
  resetScorestreakLedger(room.scorestreaks.ledger)
  room.scorestreaks.pending.clear()
  room.match.serial += 1
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
