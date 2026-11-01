import { type MatchCycle, type MatchSummaryRow, matchPhaseFrozen } from '@shobu/core'
import type { RoomMatchView } from '../net/roomMatchView.ts'
import { fighterIndexOf, type PuppetSeats } from './arenaOnline.ts'
import type { ArenaParts } from './arenaParts.ts'

/**
 * Online, o intervalo é da sala (ADR 0031): o resumo da partida chega como
 * mensagem, e os votos, o vencedor e o próximo mapa vêm no estado. A sessão os
 * guarda aqui com os ids dela, que são os que a tela de MVP conhece; quem
 * monta a tela é `matchEndDirector.ts`.
 */
export interface RoomIntermission {
  /** O resumo do MVP ao último, ou `undefined` antes de a sala mandar. */
  summary: readonly MatchSummaryRow[] | undefined
  /** Os votos à vista, com o id da sessão de quem votou. */
  readonly ballots: RoomBallot[]
  /** O índice da opção que venceu, ou `undefined` com o voto aberto. */
  winner: number | undefined
  /** O mapa da próxima partida, ou `undefined` com o voto aberto. */
  nextArenaId: string | undefined
}

/** Um voto da sala: quem votou, já com o id da sessão, e o índice da opção. */
export interface RoomBallot {
  readonly voterId: string
  readonly optionIndex: number
}

export function createRoomIntermission(): RoomIntermission {
  return { summary: undefined, ballots: [], winner: undefined, nextArenaId: undefined }
}

/** O que seguir o intervalo lê do `RoomFeed`. */
export interface RoomIntermissionFeed {
  readonly ownId: string | undefined
  matchState(): Readonly<RoomMatchView> | undefined
  drainMatchSummary(visit: (rows: readonly MatchSummaryRow[]) => void): void
  forEachBallot(visit: (voterId: string, optionIndex: number) => void): void
}

/**
 * O resumo que chegou, e, com a arena congelada, os votos e o resultado. Com a
 * partida correndo os votos não são lidos: o laço de jogo não aloca (nfr.md).
 *
 * ```ts
 * followRoomIntermission(parts, seats, session.matchCycle, session.roomIntermission, feed)
 * ```
 */
export function followRoomIntermission(
  parts: Pick<ArenaParts, 'fighters'>,
  seats: PuppetSeats,
  cycle: Readonly<MatchCycle>,
  intermission: RoomIntermission,
  feed: RoomIntermissionFeed,
): void {
  feed.drainMatchSummary((rows) => {
    intermission.summary = localSummaryOf(rows, parts, seats, feed.ownId)
  })
  if (!matchPhaseFrozen(cycle)) return
  const view = feed.matchState()
  intermission.winner = view?.winner
  intermission.nextArenaId = view?.nextArenaId
  intermission.ballots.length = 0
  feed.forEachBallot((voterId, optionIndex) => {
    const fighter = parts.fighters[fighterIndexOf(seats, feed.ownId, voterId)]
    if (fighter) intermission.ballots.push({ voterId: fighter.id, optionIndex })
  })
}

/**
 * O intervalo acabou, ou a sala é outra: nada do resumo nem do voto passa
 * para a partida seguinte.
 *
 * ```ts
 * clearRoomIntermission(session.roomIntermission)
 * ```
 */
export function clearRoomIntermission(intermission: RoomIntermission): void {
  intermission.summary = undefined
  intermission.ballots.length = 0
  intermission.winner = undefined
  intermission.nextArenaId = undefined
}

/**
 * O resumo da sala com os ids da sessão, na mesma ordem: é com eles que a tela
 * acha o nome e o retrato. Quem já saiu da sala não tem nome aqui, e fica de
 * fora.
 *
 * ```ts
 * localSummaryOf(rows, parts, seats, feed.ownId)[0].playerId // 'local', se o MVP é o jogador
 * ```
 */
export function localSummaryOf(
  rows: readonly MatchSummaryRow[],
  parts: Pick<ArenaParts, 'fighters'>,
  seats: PuppetSeats,
  ownId: string | undefined,
): readonly MatchSummaryRow[] {
  return rows.flatMap((row) => {
    const fighter = parts.fighters[fighterIndexOf(seats, ownId, row.playerId)]
    return fighter ? [{ ...row, playerId: fighter.id }] : []
  })
}
