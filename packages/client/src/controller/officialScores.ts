import type { PlayerScore, Scoreboard } from '@shobu/core'
import type { OfficialScoreFields } from '../net/roomMatchView.ts'
import { fighterIndexOf, type PuppetSeats } from './arenaOnline.ts'
import type { ArenaParts } from './arenaParts.ts'

/**
 * Online, o placar que vale é o da sala (ADR 0031): o tab, a barra das séries
 * e quem entra no meio leem os números do servidor. A sessão segue contando as
 * kills que chegam — são elas que dão as medalhas, o killfeed e o narrador —,
 * mas os pontos, os abates e as mortes são sobrescritos pelos do estado.
 */

/** O que o placar oficial lê do `RoomFeed`. */
export interface OfficialScoreFeed {
  readonly ownId: string | undefined
  forEachOfficialScore(visit: (playerId: string, score: OfficialScoreFields) => void): void
}

/**
 * Sobrescreve o placar da sessão com o da sala, pelo id da sessão: o próprio
 * jogador é o local, e cada outro é o fantoche da vaga dele. Quem a sessão
 * ainda não sentou fica de fora até o patch seguinte. A revisão só sobe quando
 * algum número mudou: é ela que redesenha o tab.
 *
 * ```ts
 * applyOfficialScores(parts, seats, feed) // depois de followRemotes
 * ```
 */
export function applyOfficialScores(
  parts: ArenaParts,
  seats: PuppetSeats,
  feed: OfficialScoreFeed,
): void {
  feed.forEachOfficialScore((playerId, official) => {
    const fighter = parts.fighters[fighterIndexOf(seats, feed.ownId, playerId)]
    const score = fighter && parts.scoreboard.players.get(fighter.id)
    if (score) overwriteScore(parts.scoreboard, score, official, playerId === feed.ownId)
  })
}

/**
 * Os pontos da vida só valem para o próprio jogador: são eles que enchem a
 * barra das séries (ADR 0029), e a dos outros não aparece em lugar nenhum.
 */
function overwriteScore(
  board: Scoreboard,
  score: PlayerScore,
  official: Readonly<OfficialScoreFields>,
  own: boolean,
): void {
  const streakPoints = own ? official.streakPoints : score.scorestreakPoints
  if (sameScore(score, official, streakPoints)) return
  score.points = official.points
  score.kills = official.kills
  score.deaths = official.deaths
  score.scorestreakPoints = streakPoints
  board.revision += 1
}

function sameScore(
  score: Readonly<PlayerScore>,
  official: Readonly<OfficialScoreFields>,
  streakPoints: number,
): boolean {
  return (
    score.points === official.points &&
    score.kills === official.kills &&
    score.deaths === official.deaths &&
    score.scorestreakPoints === streakPoints
  )
}
