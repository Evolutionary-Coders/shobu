import { KICK_BALLOT_CAST } from '@shobu/core'

/**
 * O voto de expulsão aberto como o estado da sala o traz (ADR 0034,
 * `KickVoteState`). Sem dom e sem sdk: o adapter (`gameLink.ts`) só entrega o
 * estado.
 */
export interface KickVoteFields {
  /** Vazio sem voto aberto. */
  readonly targetId: string
  /** O nome do alvo, como a sala o guardou na abertura. */
  readonly targetName: string
  readonly initiatorId: string
  /** O que falta da janela, em décimos de segundo. */
  readonly leftDs: number
  readonly yes: number
  readonly no: number
  readonly needed: number
  /** Eleitor → `KICK_BALLOT_*`. */
  readonly ballots: ReadonlyMap<string, number>
}

/** O voto aberto já lido, do ponto de vista deste jogador. */
export interface KickVoteView {
  readonly targetId: string
  readonly targetName: string
  readonly initiatorId: string
  readonly leftS: number
  readonly yes: number
  readonly no: number
  readonly needed: number
  /** O voto é contra este jogador: ele vê o aviso, sem botões. */
  readonly isTarget: boolean
  /** Este jogador estava presente na abertura e pode votar. */
  readonly isEligible: boolean
  /** Este jogador já votou; o quê, a sala não conta (ADR 0034). */
  readonly hasVoted: boolean
}

/**
 * O voto aberto, ou `undefined` sem voto, sem sala ou de um servidor sem ele.
 *
 * ```ts
 * readKickVote(link.matchState()?.kickVote, link.sessionId)
 * // { targetId: 'bia', leftS: 19.5, yes: 1, no: 0, needed: 2, isEligible: true, ... }
 * ```
 */
export function readKickVote(
  fields: Readonly<KickVoteFields> | undefined,
  ownId: string | undefined,
): KickVoteView | undefined {
  if (!fields || fields.targetId === '') return undefined
  const own = ownId === undefined ? undefined : fields.ballots.get(ownId)
  return {
    targetId: fields.targetId,
    targetName: fields.targetName,
    initiatorId: fields.initiatorId,
    leftS: fields.leftDs / 10,
    yes: fields.yes,
    no: fields.no,
    needed: fields.needed,
    isTarget: fields.targetId === ownId,
    isEligible: own !== undefined,
    hasVoted: own === KICK_BALLOT_CAST,
  }
}
