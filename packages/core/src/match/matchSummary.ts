import type { Scoreboard } from '../scoring/scoreboard.ts'
import { finalStandings } from './matchMvp.ts'

/**
 * Uma linha do resumo da partida (ADR 0031): os números de um jogador, já
 * prontos para a tela do intervalo. Sai do placar, na ordem final do MVP, e o
 * servidor manda a lista inteira a todos quando a partida acaba.
 */
export interface MatchSummaryRow {
  readonly playerId: string
  readonly points: number
  readonly kills: number
  readonly deaths: number
  /** Abates por morte; sem morte, os abates, como o tab de todo jogo mostra. */
  readonly kd: number
  /** Acertos por tiro, de 0 a 1; 0 para quem não atirou. */
  readonly accuracy: number
  readonly bestStreak: number
  readonly medals: number
}

/**
 * O resumo da partida, do MVP ao último. Aloca: é chamado uma vez, quando a
 * partida acaba.
 *
 * ```ts
 * summarizeMatch(board)[0].playerId // o MVP
 * ```
 */
export function summarizeMatch(board: Readonly<Scoreboard>): readonly MatchSummaryRow[] {
  return finalStandings(board).map((score) => ({
    playerId: score.playerId,
    points: score.points,
    kills: score.kills,
    deaths: score.deaths,
    kd: score.deaths === 0 ? score.kills : score.kills / score.deaths,
    accuracy: score.shotsFired === 0 ? 0 : score.shotsHit / score.shotsFired,
    bestStreak: score.bestStreak,
    medals: score.medals,
  }))
}

/**
 * O pódio: os três primeiros do resumo, ou menos numa sala menor.
 *
 * ```ts
 * podiumOf(summarizeMatch(board)) // [1º, 2º, 3º]
 * ```
 */
export function podiumOf(rows: readonly MatchSummaryRow[]): readonly MatchSummaryRow[] {
  return rows.slice(0, PODIUM_SIZE)
}

const PODIUM_SIZE = 3
