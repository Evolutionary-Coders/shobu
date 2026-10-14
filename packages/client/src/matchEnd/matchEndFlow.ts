/**
 * O fim de partida como sequência de fases, por quadro e sem relógio de
 * parede: o adapter (`driveMatchEnd.ts`) entrega o tempo do quadro e o
 * `matchOver` da sessão, e lê a fase.
 *
 * - `playing`: a partida corre.
 * - `over`: o tempo acabou e a arena congelou; o narrador diz o fim
 *   (`match-end`) e a tela diz FIM DE PARTIDA, por `MATCH_OVER_HOLD_S`.
 * - `results`: a tela de MVP e o voto do próximo mapa, por `RESULTS_S` — a
 *   contagem que a tela mostra.
 * - `decided`: o voto fechou; a tela mostra o mapa que venceu, por
 *   `DECIDED_HOLD_S`, para a troca não ser um corte seco.
 * - `done`: hora da partida seguinte. Quem a começa é o adapter; a partida
 *   nova zera o `matchOver`, e a fase volta a `playing`.
 */
export type MatchEndPhase = 'playing' | 'over' | 'results' | 'decided' | 'done'

/** O congelamento antes da tela de MVP: o tempo da fala de fim do narrador. */
export const MATCH_OVER_HOLD_S = 3

/** A tela de MVP e o voto: os dez segundos do pedido e do GDD. */
export const RESULTS_S = 10

/** O mapa que venceu, na tela, antes da partida seguinte. */
export const DECIDED_HOLD_S = 1.5

export interface MatchEndFlow {
  phase: MatchEndPhase
  /** Segundos na fase de agora. */
  phaseS: number
}

export function createMatchEndFlow(): MatchEndFlow {
  return { phase: 'playing', phaseS: 0 }
}

/** Quanto cada fase dura; `playing` e `done` esperam a sessão. */
const PHASE_S: Readonly<Record<MatchEndPhase, number>> = {
  playing: Number.POSITIVE_INFINITY,
  over: MATCH_OVER_HOLD_S,
  results: RESULTS_S,
  decided: DECIDED_HOLD_S,
  done: Number.POSITIVE_INFINITY,
}

const NEXT_PHASE: Readonly<Record<MatchEndPhase, MatchEndPhase>> = {
  playing: 'playing',
  over: 'results',
  results: 'decided',
  decided: 'done',
  done: 'done',
}

/**
 * Anda o quadro e devolve se a fase mudou — é a deixa do adapter para
 * redesenhar, montar o pódio ou começar a próxima partida. Uma fase por
 * quadro, no máximo: um quadro longo não pula a tela de MVP.
 *
 * ```ts
 * if (advanceMatchEndFlow(flow, session.matchOver, frameS)) onPhase(flow.phase)
 * ```
 */
export function advanceMatchEndFlow(flow: MatchEndFlow, matchOver: boolean, dtS: number): boolean {
  if (!matchOver) return enterPhase(flow, 'playing')
  if (flow.phase === 'playing') return enterPhase(flow, 'over')
  flow.phaseS += dtS
  if (flow.phaseS < PHASE_S[flow.phase]) return false
  return enterPhase(flow, NEXT_PHASE[flow.phase])
}

function enterPhase(flow: MatchEndFlow, phase: MatchEndPhase): boolean {
  if (flow.phase === phase) return false
  flow.phase = phase
  flow.phaseS = 0
  return true
}

/**
 * O número da contagem da tela de MVP: de 10 a 1, e 0 quando o voto fecha.
 * `ceil`, como o relógio da partida (`formatMatchClock`).
 *
 * ```ts
 * resultsSecondsLeft({ phase: 'results', phaseS: 0.2 }) // 10
 * ```
 */
export function resultsSecondsLeft(flow: Readonly<MatchEndFlow>): number {
  if (flow.phase !== 'results') return 0
  return Math.max(0, Math.ceil(RESULTS_S - flow.phaseS))
}
