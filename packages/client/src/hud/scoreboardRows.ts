import type { PlayerScore } from '@shobu/core'
import type { RoomPing } from '../controller/officialScores.ts'

/**
 * Uma linha do placar do tab: posição, nome, pontos, abates, mortes e ping, e se é
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
  /** A coluna de ping, já escrita (`pingLabel`). */
  readonly ping: string
  readonly local: boolean
  /**
   * O id da sala de quem está na linha, online; ausente offline e no fim de
   * partida. É por ele que o tab escolhe quem expulsar (`scoreboardSelection.ts`).
   */
  readonly roomId?: string
}

/**
 * O ping de uma linha como a coluna o mostra: os ms que o jogador relatou, BOT
 * para o bot, e `--` offline ou antes do primeiro relato — zero seria um ping
 * perfeito que ninguém tem.
 *
 * ```ts
 * pingLabel(42) // '42'
 * pingLabel('bot') // 'BOT'
 * ```
 */
export function pingLabel(ping: RoomPing | undefined): string {
  if (ping === 'bot') return 'BOT'
  if (ping === undefined || ping <= 0) return '--'
  return String(ping)
}

/** Sem sala não há ping: a tabela do fim de partida e o placar offline. */
function noPing(): RoomPing | undefined {
  return undefined
}

/** Sem sala, nenhuma linha tem id da sala. */
function noRoomId(): string | undefined {
  return undefined
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
 * scoreboardRows(rankedScores(board, into), session.nameOf, 'local', session.pingOf)
 * ```
 */
export function scoreboardRows(
  ranked: readonly Pick<PlayerScore, 'playerId' | 'points' | 'kills' | 'deaths'>[],
  nameOf: (playerId: string) => string,
  localId: string,
  pingOf: (playerId: string) => RoomPing | undefined = noPing,
  roomIdOf: (playerId: string) => string | undefined = noRoomId,
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
      ping: pingLabel(pingOf(score.playerId)),
      local: score.playerId === localId,
      ...roomIdField(roomIdOf(score.playerId)),
    }
  })
}

/** O campo só existe com id: a linha offline continua igual à de antes. */
function roomIdField(roomId: string | undefined): Pick<ScoreboardRow, 'roomId'> {
  return roomId === undefined ? {} : { roomId }
}
