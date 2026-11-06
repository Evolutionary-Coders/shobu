import { type MapVoteOutcome, type MatchPhase, type MatchSummaryRow, podiumOf } from '@shobu/core'
import type { PortraitBook } from '../character/humanSkins.ts'
import { type ScoreboardRow, scoreboardRows } from '../hud/scoreboardRows.ts'
import { ballotsInView, choiceOf, type MapVoteBooth } from './mapVoteBooth.ts'

/**
 * A tela do fim de partida como dado: o que o visor de dom
 * (`arenaHudMatchEnd.ts`) e o do óculos (`visorMatchEndOps.ts`) desenham,
 * cada um no seu meio. Montada quando algo que se lê muda — a contagem, um
 * voto, o foco —, e não por quadro (`matchEndScreenKey`).
 */
export interface MatchEndScreen {
  /** `over`: FIM DE PARTIDA, a arena congelada. `results`: MVP e voto. `decided`: o mapa que venceu. */
  readonly phase: MatchEndPhase
  /** A contagem da tela de MVP, de `match.resultsS` a 1; 0 com o voto fechado. */
  readonly secondsLeft: number
  readonly mvp: MvpCard | undefined
  /** Os três primeiros, do 1º ao 3º: a tela os põe 2º | 1º | 3º, como um pódio. */
  readonly podium: readonly PodiumCard[]
  /**
   * A sala inteira, na ordem final do MVP (`finalStandings`), com o resumo da
   * partida de cada um (ADR 0031).
   */
  readonly standings: readonly SummaryRow[]
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

/** Um lugar do pódio: quem, com o retrato e os pontos. */
export interface PodiumCard {
  /** 1, 2 ou 3. */
  readonly place: number
  readonly name: string
  readonly portraitUrl: string | undefined
  readonly points: number
  /** É o jogador local: a tela o diz em amarelo. */
  readonly local: boolean
}

/** Uma linha do resumo da partida: a do placar, e os números do intervalo já em texto. */
export interface SummaryRow extends ScoreboardRow {
  /** Abates por morte, com duas casas: `1.50`. */
  readonly kd: string
  /** Acertos por tiro, em por cento: `42%`. */
  readonly accuracy: string
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

/** As fases que têm tela: o intervalo do ciclo da partida (ADR 0031). */
export type MatchEndPhase = Exclude<MatchPhase, 'warmup' | 'live'>

export interface MatchEndScreenInput {
  /** A fase que a tela mostra (`MatchEndDirector.phase`). */
  readonly phase: MatchPhase
  /** Segundos na fase de agora: é o relógio dos votos à vista. */
  readonly phaseS: number
  /** A contagem da tela de MVP (`resultsSecondsLeft`). */
  readonly secondsLeft: number
  /** A sala na ordem final: o resumo da partida, do MVP ao último. */
  readonly standings: readonly MatchSummaryRow[]
  readonly nameOf: (playerId: string) => string
  readonly portraits: PortraitBook
  readonly localId: string
  readonly booth: Readonly<MapVoteBooth>
  /** O resultado do voto, depois que ele fecha. */
  readonly outcome: MapVoteOutcome | undefined
}

/**
 * A tela de agora, ou `null` com a partida correndo — ou já na seguinte.
 *
 * ```ts
 * hud.setMatchEnd(matchEndScreenOf({ phase, phaseS, secondsLeft, standings, nameOf, portraits, localId, booth, outcome }))
 * ```
 */
export function matchEndScreenOf(input: MatchEndScreenInput): MatchEndScreen | null {
  const { phase } = input
  if (phase === 'warmup' || phase === 'live') return null
  const best = input.standings[0]
  return {
    phase,
    secondsLeft: input.secondsLeft,
    mvp: best && mvpCardOf(best, input),
    podium: podiumOf(input.standings).map((row, index) => podiumCardOf(row, index + 1, input)),
    standings: summaryRowsOf(input),
    options: voteOptionsOf(input),
    nextMapLabel: input.booth.choices.find((choice) => choice.id === input.outcome?.mapId)?.label,
  }
}

function mvpCardOf(score: Readonly<MatchSummaryRow>, input: MatchEndScreenInput): MvpCard {
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

function podiumCardOf(
  row: Readonly<MatchSummaryRow>,
  place: number,
  input: MatchEndScreenInput,
): PodiumCard {
  return {
    place,
    name: input.nameOf(row.playerId),
    portraitUrl: input.portraits.get(row.playerId),
    points: row.points,
    local: row.playerId === input.localId,
  }
}

/** As linhas do placar (`scoreboardRows`, com o empate), e o resumo de cada um ao lado. */
function summaryRowsOf(input: MatchEndScreenInput): readonly SummaryRow[] {
  const rows = scoreboardRows(input.standings, input.nameOf, input.localId)
  return rows.map((row, index) => {
    const summary = input.standings[index] as MatchSummaryRow
    return {
      ...row,
      kd: kdLabel(summary.kd),
      accuracy: accuracyLabel(summary.accuracy),
      bestStreak: summary.bestStreak,
      medals: summary.medals,
    }
  })
}

/**
 * O K/D com duas casas, como o tab de todo jogo mostra.
 *
 * ```ts
 * kdLabel(1.5) // '1.50'
 * ```
 */
export function kdLabel(kd: number): string {
  return kd.toFixed(2)
}

/**
 * A precisão em por cento inteiro.
 *
 * ```ts
 * accuracyLabel(0.416) // '42%'
 * ```
 */
export function accuracyLabel(accuracy: number): string {
  return `${Math.round(accuracy * 100)}%`
}

function voteOptionsOf(input: MatchEndScreenInput): readonly VoteOptionView[] {
  const { booth, outcome } = input
  const ballots = ballotsInView(booth, votingClockS(input))
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
function votingClockS(input: Pick<MatchEndScreenInput, 'phase' | 'phaseS'>): number {
  if (input.phase === 'over') return Number.NEGATIVE_INFINITY
  return input.phase === 'results' ? input.phaseS : Number.POSITIVE_INFINITY
}

/**
 * O que, mudando, muda a tela: a fase, a contagem, a ordem final (online o
 * resumo da sala chega depois do fim), quantos votos se veem, o foco, o voto
 * do jogador e o resultado. O adapter compara esta chave por
 * quadro e só remonta a tela quando ela muda.
 *
 * ```ts
 * if (matchEndScreenKey(input) !== last) hud.setMatchEnd(matchEndScreenOf(input))
 * ```
 */
export function matchEndScreenKey(input: MatchEndScreenInput): string {
  const { booth } = input
  return [
    input.phase,
    input.secondsLeft,
    input.standings.map((row) => `${row.playerId}:${row.points}`).join(','),
    ballotsInView(booth, votingClockS(input)).length,
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
