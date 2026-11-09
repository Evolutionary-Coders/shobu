import { isSquadBotId } from '@shobu/core'
import type { ScoreboardRow } from './scoreboardRows.ts'

/**
 * A escolha de quem expulsar no placar do tab (ADR 0034), como no call of
 * duty: com o TAB preso, a roda anda pelas linhas e o K abre o voto. Só anda
 * pelas linhas de outro humano da sala: bot e o próprio jogador ficam de fora.
 */

/**
 * Se a linha é de alguém que dá para votar: outro humano da sala.
 *
 * ```ts
 * isKickableRow({ ...row, roomId: 'aB3', local: false }) // true
 * ```
 */
export function isKickableRow(row: Pick<ScoreboardRow, 'roomId' | 'local'>): boolean {
  return row.roomId !== undefined && !row.local && !isSquadBotId(row.roomId)
}

/**
 * A linha escolhida depois de `steps` giros da roda, pelo id da sala, ou
 * `undefined` sem linha que dê para votar. Sem escolha, o primeiro giro para
 * baixo vai à primeira e para cima à última; a escolha dá a volta, como a
 * do menu, porque são no máximo três linhas.
 *
 * ```ts
 * stepKickSelection(rows, undefined, 1) // o id da primeira linha votável
 * ```
 */
export function stepKickSelection(
  rows: readonly Pick<ScoreboardRow, 'roomId' | 'local'>[],
  current: string | undefined,
  steps: number,
): string | undefined {
  const ids = rows.filter(isKickableRow).map((row) => row.roomId as string)
  if (ids.length === 0) return undefined
  const at = ids.indexOf(current ?? '')
  if (at < 0) return steps < 0 ? ids[ids.length - 1] : ids[0]
  const next = (((at + steps) % ids.length) + ids.length) % ids.length
  return ids[next]
}

/**
 * A escolha de antes, se a linha ainda está lá e ainda dá para votar; senão,
 * nenhuma: quem saiu da sala não fica escolhido.
 *
 * ```ts
 * keptKickSelection(rows, 'aB3') // 'aB3' enquanto ele estiver na sala
 * ```
 */
export function keptKickSelection(
  rows: readonly Pick<ScoreboardRow, 'roomId' | 'local'>[],
  current: string | undefined,
): string | undefined {
  return rows.some((row) => row.roomId === current && isKickableRow(row)) ? current : undefined
}

/**
 * O id da sala de cada lutador da sessão online, para as linhas do placar
 * (`scoreboardRows`). Lido quando o placar muda, e não por quadro.
 *
 * ```ts
 * scoreboardRows(ranked, session.nameOf, 'local', session.pingOf, roomIdLookup(session))
 * ```
 */
export function roomIdLookup(session: {
  forEachRoomPlayer(visit: (playerId: string, fighter: { readonly id: string }) => void): void
}): (fighterId: string) => string | undefined {
  const byFighter = new Map<string, string>()
  session.forEachRoomPlayer((playerId, fighter) => byFighter.set(fighter.id, playerId))
  return (fighterId) => byFighter.get(fighterId)
}

/**
 * O hud com as últimas linhas do placar à mão: quem escolhe no tab anda por
 * elas, na ordem da tela, sem montar o placar de novo.
 *
 * ```ts
 * const watched = watchScoreboardRows(hud)
 * driveArenaReadouts(scene, { ...options, hud: watched.hud })
 * watched.rows() // as linhas que a tela mostra
 * ```
 */
export function watchScoreboardRows<
  Hud extends { setScoreboard(rows: readonly ScoreboardRow[]): void },
>(hud: Hud): { readonly hud: Hud; rows(): readonly ScoreboardRow[] } {
  let shown: readonly ScoreboardRow[] = []
  const watched = {
    ...hud,
    setScoreboard: (rows: readonly ScoreboardRow[]) => {
      shown = rows
      hud.setScoreboard(rows)
    },
  }
  return { hud: watched, rows: () => shown }
}

/**
 * A escolha do quadro: os giros desde o último andam por ela; sem giro, ela
 * fica, se a linha ainda dá para votar.
 *
 * ```ts
 * selected = pickKickRow(watched.rows(), selected, wheelSteps)
 * ```
 */
export function pickKickRow(
  rows: readonly Pick<ScoreboardRow, 'roomId' | 'local'>[],
  current: string | undefined,
  steps: number,
): string | undefined {
  return steps === 0 ? keptKickSelection(rows, current) : stepKickSelection(rows, current, steps)
}
