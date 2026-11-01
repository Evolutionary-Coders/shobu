import { type MatchConfig, type MatchCycle, matchPhaseLeftS } from '@shobu/core'

/**
 * O fim de partida lido do ciclo da partida do núcleo (ADR 0031): as fases e
 * quanto cada uma dura são de `matchCycle.ts` e de `match` no config, e não
 * mais daqui. O que fica é a leitura que a tela de MVP faz delas.
 */

/**
 * O número da contagem da tela de MVP: de `match.resultsS` a 1, e 0 fora
 * dela. `ceil`, como o relógio da partida (`formatMatchClock`).
 *
 * ```ts
 * resultsSecondsLeft({ phase: 'results', phaseS: 0.2, timed: true, restartDue: false }, match) // 10
 * ```
 */
export function resultsSecondsLeft(cycle: Readonly<MatchCycle>, match: MatchConfig): number {
  if (cycle.phase !== 'results') return 0
  return Math.ceil(matchPhaseLeftS(cycle, match))
}
