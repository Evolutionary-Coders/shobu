import type { PlayerScore } from '@shobu/core'

/**
 * Uma linha do placar do tab: posição, nome, pontos, abates e mortes, e se é
 * o jogador local — que a tela destaca. Dado pronto para desenhar: quem
 * escreve no dom é `arenaHudScoreboard.ts`, e quem pinta no óculos é
 * `headsetVisorModel.ts`.
 */
export interface ScoreboardRow {
  readonly rank: number
  readonly name: string
  readonly points: number
  readonly kills: number
  readonly deaths: number
  readonly local: boolean
}

/**
 * As linhas do placar a partir do `rankedScores` do núcleo, que já vem em
 * ordem. **Empate fica empate** (GDD): quem tem os mesmos pontos divide a
 * posição, e a seguinte pula — 1, 1, 3 —, como em toda tabela de
 * campeonato. A ordem entre os empatados é a de entrada na sala, que é a do
 * `rankedScores`.
 *
 * Aloca: é chamada quando o placar muda, uma vez por kill, e não por quadro.
 *
 * ```ts
 * scoreboardRows(rankedScores(board, into), session.nameOf, 'local')
 * ```
 */
export function scoreboardRows(
  ranked: readonly PlayerScore[],
  nameOf: (playerId: string) => string,
  localId: string,
): readonly ScoreboardRow[] {
  let rank = 0
  let previousPoints = Number.NaN
  return ranked.map((score, index) => {
    if (score.points !== previousPoints) rank = index + 1
    previousPoints = score.points
    return {
      rank,
      name: nameOf(score.playerId),
      points: score.points,
      kills: score.kills,
      deaths: score.deaths,
      local: score.playerId === localId,
    }
  })
}
