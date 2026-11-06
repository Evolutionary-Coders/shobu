import type { KickVoteClosedMessage, KickVoteRefusal } from '@shobu/core'
import type { GameLink } from './gameLink.ts'
import { type KickVoteView, readKickVote } from './kickVoteView.ts'

/** O que a sala avisou do voto de expulsão fora do quadro: a recusa a este jogador, ou o fim. */
export type KickVoteNotice =
  | { readonly kind: 'refused'; readonly reason: KickVoteRefusal }
  | { readonly kind: 'closed'; readonly closed: KickVoteClosedMessage }

/** O voto de expulsão pela porta de rede (ADR 0034). Sem sala, nada vai e nada vem. */
export interface KickVotePort {
  /** O voto aberto na sala, do ponto de vista deste jogador, ou `undefined`. */
  kickVote(): KickVoteView | undefined
  /** O anfitrião da sala privada, ou `undefined` na pública e sem sala. */
  hostId(): string | undefined
  /** Pede o voto contra o jogador, pelo id da sala. */
  startKickVote(targetId: string): void
  /** SIM ou NÃO no voto aberto. */
  castKickBallot(yes: boolean): void
  /** As recusas e os fins de voto desde a última chamada, com o contrato do `drainKills`. */
  drainKickVoteNotices(visit: (notice: KickVoteNotice) => void): void
}

/**
 * O pedaço da porta do voto de expulsão, e quem escuta cada sala nova. O
 * aviso de uma sala que já foi trocada não entra: ele fala de outra sala.
 *
 * ```ts
 * const kick = createKickVoteRelay(() => slot.link)
 * kick.listen(link) // na chegada de cada sala
 * kick.port.kickVote()
 * ```
 */
export function createKickVoteRelay(linkOf: () => GameLink | undefined): {
  readonly port: KickVotePort
  listen(link: GameLink): void
} {
  const notices: KickVoteNotice[] = []
  const push = (link: GameLink, notice: KickVoteNotice): void => {
    if (linkOf() === link) notices.push(notice)
  }
  return {
    port: kickVotePortOf(linkOf, notices),
    listen: (link) => {
      link.onKickVoteRefused((reason) => push(link, { kind: 'refused', reason }))
      link.onKickVoteClosed((closed) => push(link, { kind: 'closed', closed }))
    },
  }
}

function kickVotePortOf(
  linkOf: () => GameLink | undefined,
  notices: KickVoteNotice[],
): KickVotePort {
  return {
    kickVote: () => {
      const link = linkOf()
      return readKickVote(link?.matchState()?.kickVote, link?.sessionId)
    },
    hostId: () => linkOf()?.matchState()?.hostId || undefined,
    startKickVote: (targetId) => linkOf()?.startKickVote(targetId),
    castKickBallot: (yes) => linkOf()?.castKickBallot(yes),
    drainKickVoteNotices: (visit) => {
      for (const notice of notices) visit(notice)
      notices.length = 0
    },
  }
}
