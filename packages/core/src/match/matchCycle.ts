import type { MatchConfig } from '../config/gameplayConfig.ts'

/**
 * O ciclo da partida como sequência de fases, por passo e sem relógio de
 * parede (ADR 0031). Online, quem anda o ciclo é o servidor, e o cliente
 * copia a fase do estado da sala; offline, o cliente anda o mesmo ciclo
 * sozinho. As duas pontas leem as mesmas regras daqui.
 *
 * - `warmup`: o aquecimento. Todo mundo anda e atira; ninguém morre nem pontua.
 * - `live`: a partida vale, até o relógio ou o limite de pontos.
 * - `over`: a arena congela e o narrador diz o fim.
 * - `results`: a tela de MVP e o voto do próximo mapa.
 * - `decided`: o voto fechou; a tela mostra o mapa que venceu.
 *
 * Depois de `decided` vem a partida seguinte, que não é fase: o passo avisa
 * `next`, e quem anda o ciclo troca o mapa e chama `restartMatchCycle`.
 */
export type MatchPhase = 'warmup' | 'live' | 'over' | 'results' | 'decided'

/** A fase em que o passo entrou, ou `next`: hora de recomeçar. */
export type MatchCycleEdge = Exclude<MatchPhase, 'warmup'> | 'next'

export interface MatchCycle {
  phase: MatchPhase
  /** Segundos na fase de agora. */
  phaseS: number
  /** Sem relógio, a partida só acaba quando o jogador sai: é o treino. */
  readonly timed: boolean
  /** O `next` já foi avisado: o ciclo espera `restartMatchCycle` e não avisa de novo. */
  restartDue: boolean
}

const EDGE_AFTER: Readonly<Record<MatchPhase, MatchCycleEdge>> = {
  warmup: 'live',
  live: 'over',
  over: 'results',
  results: 'decided',
  decided: 'next',
}

/**
 * Um ciclo novo. Com aquecimento começa em `warmup`, a partida online; sem
 * ele, já em `live`, que é o offline e o treino: lá não há quem esperar.
 *
 * ```ts
 * const cycle = createMatchCycle({ warmup: true, timed: true })
 * ```
 */
export function createMatchCycle(options: {
  readonly warmup: boolean
  readonly timed: boolean
}): MatchCycle {
  return {
    phase: options.warmup ? 'warmup' : 'live',
    phaseS: 0,
    timed: options.timed,
    restartDue: false,
  }
}

/**
 * Anda o ciclo um passo e devolve a borda, se houve. Uma borda por passo, no
 * máximo, como o fim de partida do cliente fazia: um quadro longo não pula a
 * tela de MVP. A partida em andamento acaba no relógio ou no limite de
 * pontos, o que vier primeiro, e só quando tem relógio.
 *
 * ```ts
 * const edge = stepMatchCycle(cycle, 1 / 60, leaderPoints(board), config.match)
 * if (edge === 'over') freezeArena()
 * ```
 */
export function stepMatchCycle(
  cycle: MatchCycle,
  dtS: number,
  leaderPoints: number,
  match: MatchConfig,
): MatchCycleEdge | undefined {
  if (cycle.restartDue) return undefined
  cycle.phaseS += dtS
  if (!phaseEnded(cycle, leaderPoints, match)) return undefined
  const edge = EDGE_AFTER[cycle.phase]
  if (edge === 'next') {
    cycle.restartDue = true
    return edge
  }
  cycle.phase = edge
  cycle.phaseS = 0
  return edge
}

function phaseEnded(
  cycle: Readonly<MatchCycle>,
  leaderPoints: number,
  match: MatchConfig,
): boolean {
  if (cycle.phaseS >= matchPhaseLengthS(cycle, match)) return true
  return cycle.phase === 'live' && cycle.timed && scoreLimitReached(leaderPoints, match)
}

/**
 * Quanto a fase de agora dura. A partida sem relógio não acaba no tempo.
 *
 * ```ts
 * matchPhaseLengthS({ phase: 'results', phaseS: 0, timed: true, restartDue: false }, match) // 10
 * ```
 */
export function matchPhaseLengthS(cycle: Readonly<MatchCycle>, match: MatchConfig): number {
  switch (cycle.phase) {
    case 'warmup':
      return match.warmupS
    case 'live':
      return cycle.timed ? match.durationS : Number.POSITIVE_INFINITY
    case 'over':
      return match.overHoldS
    case 'results':
      return match.resultsS
    case 'decided':
      return match.decidedHoldS
  }
}

/**
 * Os segundos que faltam na fase de agora, nunca abaixo de zero: é o relógio
 * do hud e o número que viaja no estado da sala. A partida sem relógio tem
 * `Infinity`.
 *
 * ```ts
 * matchPhaseLeftS(cycle, config.match) // 287.4
 * ```
 */
export function matchPhaseLeftS(cycle: Readonly<MatchCycle>, match: MatchConfig): number {
  return Math.max(0, matchPhaseLengthS(cycle, match) - cycle.phaseS)
}

/**
 * Se a kill vale ponto agora. Só a partida em andamento pontua: no
 * aquecimento ninguém morre, e no intervalo a arena está congelada.
 *
 * ```ts
 * if (!matchPhaseScores(cycle)) return
 * ```
 */
export function matchPhaseScores(cycle: Readonly<MatchCycle>): boolean {
  return cycle.phase === 'live'
}

/**
 * Se a arena está congelada: do fim até a partida seguinte, ninguém anda nem
 * atira.
 *
 * ```ts
 * if (matchPhaseFrozen(cycle)) return
 * ```
 */
export function matchPhaseFrozen(cycle: Readonly<MatchCycle>): boolean {
  return isFrozenPhase(cycle.phase)
}

/**
 * A mesma pergunta para uma fase solta, sem ciclo: a tela de MVP compara a
 * fase que mostra com a do ciclo, e só tem a fase na mão.
 *
 * ```ts
 * isFrozenPhase('results') // true
 * ```
 */
export function isFrozenPhase(phase: MatchPhase): boolean {
  return phase === 'over' || phase === 'results' || phase === 'decided'
}

/**
 * Se o líder chegou ao limite de pontos. Limite 0 é partida só de relógio.
 *
 * ```ts
 * scoreLimitReached(3000, config.match) // true com scoreLimitPoints 3000
 * ```
 */
export function scoreLimitReached(leaderPoints: number, match: MatchConfig): boolean {
  return match.scoreLimitPoints > 0 && leaderPoints >= match.scoreLimitPoints
}

/**
 * A partida seguinte, depois do `next`: o ciclo volta ao começo, com ou sem
 * aquecimento.
 *
 * ```ts
 * if (edge === 'next') restartMatchCycle(cycle, true)
 * ```
 */
export function restartMatchCycle(cycle: MatchCycle, warmup: boolean): void {
  cycle.phase = warmup ? 'warmup' : 'live'
  cycle.phaseS = 0
  cycle.restartDue = false
}
