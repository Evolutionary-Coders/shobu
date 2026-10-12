import type { MapVoteOutcome, PlayerScore } from '@shobu/core'
import { type ScoreboardRow, scoreboardRows } from '../hud/scoreboardRows.ts'
import { ballotsInView, choiceOf, type MapVoteBooth } from './mapVoteBooth.ts'
import { type MatchEndFlow, resultsSecondsLeft } from './matchEndFlow.ts'

/**
 * A tela do fim de partida como dado: o que o visor de dom
 * (`arenaHudMatchEnd.ts`) e o do óculos (`visorMatchEndOps.ts`) desenham,
 * cada um no seu meio. Montada quando algo que se lê muda — a contagem, um
 * voto, o foco —, e não por quadro (`matchEndScreenKey`).
 */
export interface MatchEndScreen {
  /** `over`: FIM DE PARTIDA, a arena congelada. `results`: MVP e voto. `decided`: o mapa que venceu. */
  readonly phase: 'over' | 'results' | 'decided'
  /** A contagem da tela de MVP, de 10 a 1; 0 com o voto fechado. */
  readonly secondsLeft: number
  readonly mvp: MvpCard | undefined
  /** A sala inteira, na ordem final do MVP (`finalStandings`). */
  readonly standings: readonly ScoreboardRow[]
  readonly options: readonly VoteOptionView[]
  /** O nome do mapa da próxima partida, com o voto fechado. */
  readonly nextMapLabel: string | undefined
}

/** O melhor jogador da partida, com os números que o fizeram MVP. */
export interface MvpCard {
  readonly name: string
  readonly portraitUrl: string | undefined
  /** É o jogador local: a tela o diz em amarelo, a cor do que é seu. */
  readonly local: boolean
  readonly points: number
  readonly kills: number
  readonly deaths: number
  readonly bestStreak: number
  readonly medals: number
}

export interface VoteOptionView {
  readonly label: string
  readonly votes: number
  /** Quem votou nela, na ordem em que os votos chegaram. */
  readonly voters: readonly string[]
  /** O jogador votou nela. */
  readonly mine: boolean
  /** O foco do mouse, das setas ou do d-pad. */
  readonly focused: boolean
  /** Venceu: só com o voto fechado. */
  readonly winner: boolean
}

export const MATCH_OVER_TITLE = 'FIM DE PARTIDA'
export const MVP_TITLE = 'MVP — MELHOR JOGADOR DA PARTIDA'
export const VOTE_TITLE = 'PRÓXIMO MAPA'

export interface MatchEndScreenInput {
  readonly flow: Readonly<MatchEndFlow>
  /** A sala na ordem final (`finalStandings`), tirada uma vez, quando o tempo acaba. */
  readonly standings: readonly PlayerScore[]
  readonly nameOf: (playerId: string) => string
  readonly portraits: ReadonlyMap<string, string>
  readonly localId: string
  readonly booth: Readonly<MapVoteBooth>
  /** O resultado do voto, depois que ele fecha. */
  readonly outcome: MapVoteOutcome | undefined
}

/**
 * A tela de agora, ou `null` com a partida correndo — ou já na seguinte.
 *
 * ```ts
 * hud.setMatchEnd(matchEndScreenOf({ flow, standings, nameOf, portraits, localId, booth, outcome }))
 * ```
 */
export function matchEndScreenOf(input: MatchEndScreenInput): MatchEndScreen | null {
  const { phase } = input.flow
  if (phase === 'playing' || phase === 'done') return null
  const best = input.standings[0]
  return {
    phase,
    secondsLeft: resultsSecondsLeft(input.flow),
    mvp: best && mvpCardOf(best, input),
    standings: scoreboardRows(input.standings, input.nameOf, input.localId),
    options: voteOptionsOf(input),
    nextMapLabel: input.booth.choices.find((choice) => choice.id === input.outcome?.mapId)?.label,
  }
}

function mvpCardOf(score: Readonly<PlayerScore>, input: MatchEndScreenInput): MvpCard {
  return {
    name: input.nameOf(score.playerId),
    portraitUrl: input.portraits.get(score.playerId),
    local: score.playerId === input.localId,
    points: score.points,
    kills: score.kills,
    deaths: score.deaths,
    bestStreak: score.bestStreak,
    medals: score.medals,
  }
}

function voteOptionsOf(input: MatchEndScreenInput): readonly VoteOptionView[] {
  const { booth, outcome } = input
  const ballots = ballotsInView(booth, votingClockS(input.flow))
  const mine = choiceOf(booth, input.localId)
  return booth.choices.map((choice, index) => {
    const voters = ballots.filter((ballot) => ballot.optionId === choice.id)
    return {
      label: choice.label,
      votes: voters.length,
      voters: voters.map((ballot) => input.nameOf(ballot.voterId)),
      mine: index === mine,
      focused: index === booth.focus && outcome === undefined,
      winner: choice.id === outcome?.optionId,
    }
  })
}

/** Os votos à vista: até agora na tela de MVP, e todos depois que ela fecha. */
function votingClockS(flow: Readonly<MatchEndFlow>): number {
  if (flow.phase === 'over') return Number.NEGATIVE_INFINITY
  return flow.phase === 'results' ? flow.phaseS : Number.POSITIVE_INFINITY
}

/**
 * O que, mudando, muda a tela: a fase, a contagem, quantos votos se veem, o
 * foco, o voto do jogador e o resultado. O adapter compara esta chave por
 * quadro e só remonta a tela quando ela muda.
 *
 * ```ts
 * if (matchEndScreenKey(input) !== last) hud.setMatchEnd(matchEndScreenOf(input))
 * ```
 */
export function matchEndScreenKey(input: MatchEndScreenInput): string {
  const { flow, booth } = input
  return [
    flow.phase,
    resultsSecondsLeft(flow),
    ballotsInView(booth, votingClockS(flow)).length,
    booth.focus,
    choiceOf(booth, input.localId),
    input.outcome?.optionId ?? '',
  ].join('|')
}

/** Um número do cartão do MVP: o rótulo e o valor já em texto. */
export interface MvpStat {
  readonly label: string
  readonly value: string
}

/**
 * Os números do MVP, na ordem em que a tela os lê: os que o fizeram MVP
 * primeiro. Os dois visores leem esta lista, para não divergirem no rótulo.
 *
 * ```ts
 * mvpStats(card)[0] // { label: 'PONTOS', value: '1350' }
 * ```
 */
export function mvpStats(card: Readonly<MvpCard>): readonly MvpStat[] {
  return [
    { label: 'PONTOS', value: String(card.points) },
    { label: 'ABATES', value: String(card.kills) },
    { label: 'MORTES', value: String(card.deaths) },
    { label: 'MELHOR SEQUÊNCIA', value: String(card.bestStreak) },
    { label: 'MEDALHAS', value: String(card.medals) },
  ]
}
