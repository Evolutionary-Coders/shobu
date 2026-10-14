import {
  type BallotWindow,
  ballotsCastBy,
  botBallots,
  castBallot,
  decideMapVote,
  type MapBallot,
  type MapVoteOutcome,
  mapVoteOptions,
} from '@shobu/core'
import type { ArenaChoice } from '../arena/arenaChoices.ts'

/**
 * A cabine de votação do próximo mapa no cliente: as opções com o nome que a
 * tela lê, os votos — os dos bots já agendados, e o do jogador quando ele
 * votar — e a opção em foco, que o mouse, as setas e o d-pad andam. As regras
 * são do núcleo (`mapVote.ts`); aqui é só o estado da tela, sem dom.
 */
export interface MapVoteBooth {
  readonly choices: readonly ArenaChoice[]
  readonly seed: number
  ballots: readonly MapBallot[]
  /** A opção em foco: a que o clique, o Enter ou o A votam. */
  focus: number
}

/** O nome do aleatório na tela. */
export const RANDOM_MAP_LABEL = 'ALEATÓRIO'

/**
 * Os bots votam entre 1,2 e 6,5 s da tela de MVP: depois de o jogador ver a
 * tela, e com folga antes do fim, para ele ainda poder virar o voto.
 */
export const BOT_BALLOT_WINDOW: BallotWindow = { fromS: 1.2, untilS: 6.5 }

/**
 * ```ts
 * const booth = openVoteBooth(MATCH_ARENAS, ['bot-0', 'bot-1'], session.matchSeed)
 * ```
 */
export function openVoteBooth(
  arenas: readonly ArenaChoice[],
  botIds: readonly string[],
  seed: number,
): MapVoteBooth {
  const ids = mapVoteOptions(arenas.map((arena) => arena.id))
  const random = ids[ids.length - 1] as string
  return {
    choices: [...arenas, { id: random, label: RANDOM_MAP_LABEL }],
    seed,
    ballots: botBallots(botIds, ids, seed, BOT_BALLOT_WINDOW),
    focus: 0,
  }
}

/** Anda o foco, dando a volta nas pontas. */
export function moveVoteFocus(booth: MapVoteBooth, step: number): void {
  const count = booth.choices.length
  booth.focus = (((booth.focus + step) % count) + count) % count
}

/**
 * O voto do jogador na opção `index`, que também ganha o foco. Fora da lista
 * (a tecla 4 com três opções), nada acontece.
 *
 * ```ts
 * castVote(booth, 'local', 1, flow.phaseS)
 * ```
 */
export function castVote(booth: MapVoteBooth, voterId: string, index: number, atS: number): void {
  const choice = booth.choices[index]
  if (!choice) return
  booth.focus = index
  booth.ballots = castBallot(booth.ballots, { voterId, optionId: choice.id, atS })
}

/** Os votos à vista em `nowS`, na ordem em que chegaram. */
export function ballotsInView(booth: Readonly<MapVoteBooth>, nowS: number): readonly MapBallot[] {
  return ballotsCastBy(booth.ballots, nowS)
}

/** A opção em que `voterId` votou, ou -1. */
export function choiceOf(booth: Readonly<MapVoteBooth>, voterId: string): number {
  const ballot = booth.ballots.find((cast) => cast.voterId === voterId)
  return ballot ? booth.choices.findIndex((choice) => choice.id === ballot.optionId) : -1
}

/** O resultado, com todos os votos: é chamado quando a contagem chega a zero. */
export function closeVoteBooth(booth: Readonly<MapVoteBooth>): MapVoteOutcome {
  return decideMapVote(
    booth.choices.map((choice) => choice.id),
    booth.ballots,
    booth.seed,
  )
}
