import type { MatchConfig } from '../config/gameplayConfig.ts'
import type { Scoreboard } from '../scoring/scoreboard.ts'

/**
 * As falas de liderança do narrador (ADR 0031): o jogador assumiu a ponta
 * sozinho, perdeu a ponta, ou está a uma kill do limite de pontos. Lê só o
 * placar, então serve igual offline e online — online o placar já traz os
 * números oficiais da sala.
 *
 * - `lead-taken`: o jogador passou a liderar **sozinho**, com pontos.
 * - `lead-lost`: liderava sozinho e não lidera mais — empatado ou passado.
 * - `one-kill-left`: mais uma kill fecha o limite de pontos. Exato, porque
 *   toda kill paga pelo menos `pointsPerKill`. Uma vez por partida.
 */
export type LeadershipCallout = 'lead-taken' | 'lead-lost' | 'one-kill-left'

/** O que a vigia lembra do quadro anterior. */
export interface LeadershipWatch {
  soleLeader: boolean
  oneKillWarned: boolean
  /** Os pontos do jogador da última leitura: cair é sinal de partida nova. */
  points: number
}

/**
 * ```ts
 * const watch = createLeadershipWatch()
 * ```
 */
export function createLeadershipWatch(): LeadershipWatch {
  return { soleLeader: false, oneKillWarned: false, points: 0 }
}

/**
 * A partida nova: ninguém lidera e o aviso de uma kill volta a valer.
 *
 * ```ts
 * resetLeadershipWatch(watch) // no começo da partida seguinte
 * ```
 */
export function resetLeadershipWatch(watch: LeadershipWatch): void {
  watch.soleLeader = false
  watch.oneKillWarned = false
  watch.points = 0
}

/**
 * A fala que o placar pede desde a última leitura, ou `undefined`. No máximo
 * uma por chamada, e a de uma kill vem antes da de liderança: com as duas no
 * mesmo quadro, a que diz "acaba agora" é a que o jogador precisa ouvir. A
 * liderança é anotada mesmo assim, para não falar atrasada no quadro seguinte.
 *
 * Os pontos do jogador nunca descem dentro de uma partida; se desceram, o
 * placar zerou, e a vigia zera junto, sem anunciar a liderança perdida.
 * Não aloca: roda por quadro.
 *
 * ```ts
 * leadershipCalloutSince(watch, board, LOCAL_PLAYER_ID, config.match) // 'lead-taken'
 * ```
 */
export function leadershipCalloutSince(
  watch: LeadershipWatch,
  board: Readonly<Scoreboard>,
  localId: string,
  match: Readonly<MatchConfig>,
): LeadershipCallout | undefined {
  const points = board.players.get(localId)?.points ?? 0
  if (points < watch.points) resetLeadershipWatch(watch)
  watch.points = points
  const sole = isSoleLeader(board, localId, points)
  const leadCallout = leadChange(watch.soleLeader, sole)
  watch.soleLeader = sole
  if (oneKillLeft(watch, points, match)) return 'one-kill-left'
  return leadCallout
}

function leadChange(wasSole: boolean, sole: boolean): LeadershipCallout | undefined {
  if (sole === wasSole) return undefined
  return sole ? 'lead-taken' : 'lead-lost'
}

function isSoleLeader(board: Readonly<Scoreboard>, localId: string, points: number): boolean {
  if (points <= 0) return false
  for (const score of board.players.values()) {
    if (score.playerId !== localId && score.points >= points) return false
  }
  return true
}

/** Verdade uma vez só: quando mais uma kill fecha o limite e ele ainda não fechou. */
function oneKillLeft(
  watch: LeadershipWatch,
  points: number,
  match: Readonly<MatchConfig>,
): boolean {
  if (watch.oneKillWarned || match.scoreLimitPoints <= 0) return false
  if (points >= match.scoreLimitPoints) return false
  if (points + match.pointsPerKill < match.scoreLimitPoints) return false
  watch.oneKillWarned = true
  return true
}
