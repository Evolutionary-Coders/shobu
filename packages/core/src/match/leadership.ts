import type { MatchConfig } from '../config/gameplayConfig.ts'
import type { Scoreboard } from '../scoring/scoreboard.ts'

/**
 * As falas de liderança do narrador (ADR 0031): o jogador assumiu a ponta
 * sozinho, perdeu a ponta, ou está a uma kill do limite de pontos. Lê só o
 * placar, então serve igual offline e online — online o placar já traz os
 * números oficiais da sala.
 *
 * - `lead-taken`: o jogador passou a liderar **sozinho**, com pontos.
 * - `lead-lost`: liderava e alguém o **passou**. Empatar não tira a ponta, e
 *   empatar com quem lidera não a dá: o empate é a faixa morta entre as duas
 *   falas, e trocar kills com o vice não vira um "assumiu, perdeu" por kill.
 * - `one-kill-left`: mais uma kill fecha o limite de pontos. Exato, porque
 *   toda kill paga pelo menos `pointsPerKill`. Uma vez por partida.
 *
 * Mesmo fora do empate, duas falas de liderança ficam a pelo menos
 * `LEAD_CALLOUT_COOLDOWN_S` uma da outra; a troca no meio é anotada, calada.
 */
export type LeadershipCallout = 'lead-taken' | 'lead-lost' | 'one-kill-left'

/**
 * O mínimo entre duas falas de liderança, em segundos: com kills a cada dois
 * ou três segundos no topo, o narrador repetiria a ponta a cada kill.
 */
export const LEAD_CALLOUT_COOLDOWN_S = 8

/** O que a vigia lembra do quadro anterior. */
export interface LeadershipWatch {
  /** Assumiu a ponta sozinho e ninguém o passou desde então (empatar não conta). */
  leading: boolean
  oneKillWarned: boolean
  /** Os pontos do jogador da última leitura: cair é sinal de partida nova. */
  points: number
  /** Quando saiu a última fala de liderança, no relógio de quem chama. */
  leadSpokenS: number
}

/** Onde o jogador está em relação ao melhor dos outros. */
type LeadStanding = 'ahead' | 'tied' | 'behind'

/**
 * ```ts
 * const watch = createLeadershipWatch()
 * ```
 */
export function createLeadershipWatch(): LeadershipWatch {
  return {
    leading: false,
    oneKillWarned: false,
    points: 0,
    leadSpokenS: Number.NEGATIVE_INFINITY,
  }
}

/**
 * A partida nova: ninguém lidera e o aviso de uma kill volta a valer.
 *
 * ```ts
 * resetLeadershipWatch(watch) // no começo da partida seguinte
 * ```
 */
export function resetLeadershipWatch(watch: LeadershipWatch): void {
  Object.assign(watch, createLeadershipWatch())
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
 * leadershipCalloutSince(watch, board, LOCAL_PLAYER_ID, config.match, nowS) // 'lead-taken'
 * ```
 */
export function leadershipCalloutSince(
  watch: LeadershipWatch,
  board: Readonly<Scoreboard>,
  localId: string,
  match: Readonly<MatchConfig>,
  nowS: number,
): LeadershipCallout | undefined {
  const points = board.players.get(localId)?.points ?? 0
  if (points < watch.points) resetLeadershipWatch(watch)
  watch.points = points
  const leadCallout = spokenLeadChange(watch, standingOf(board, localId, points), nowS)
  if (oneKillLeft(watch, points, match)) return 'one-kill-left'
  return leadCallout
}

/** A troca de liderança, anotada sempre, e dita só fora do intervalo entre falas. */
function spokenLeadChange(
  watch: LeadershipWatch,
  standing: LeadStanding,
  nowS: number,
): LeadershipCallout | undefined {
  const change = leadChange(watch, standing)
  if (!change || nowS - watch.leadSpokenS < LEAD_CALLOUT_COOLDOWN_S) return undefined
  watch.leadSpokenS = nowS
  return change
}

/** Só passar todo mundo dá a ponta, e só ser passado a tira: o empate não mexe. */
function leadChange(watch: LeadershipWatch, standing: LeadStanding): LeadershipCallout | undefined {
  if (standing === 'ahead' && !watch.leading) {
    watch.leading = true
    return 'lead-taken'
  }
  if (standing !== 'behind' || !watch.leading) return undefined
  watch.leading = false
  return 'lead-lost'
}

/** Sem pontos o jogador não está na frente de ninguém, nem empatado com quem lidera. */
function standingOf(board: Readonly<Scoreboard>, localId: string, points: number): LeadStanding {
  if (points <= 0) return 'behind'
  let standing: LeadStanding = 'ahead'
  for (const score of board.players.values()) {
    if (score.playerId === localId) continue
    if (score.points > points) return 'behind'
    if (score.points === points) standing = 'tied'
  }
  return standing
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
