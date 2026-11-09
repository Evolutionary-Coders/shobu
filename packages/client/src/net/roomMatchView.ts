import { decodeMatchPhase, dequantizePhaseLeft, type MatchPhase } from '@shobu/core'
import type { KickVoteFields } from './kickVoteView.ts'

/**
 * A partida da sala como o estado do colyseus a traz (ADR 0031), e o placar
 * oficial de cada jogador. Os campos são os inteiros do fio; quem os lê como
 * fase e segundos é `readRoomMatch`. Sem dom e sem sdk: o adapter
 * (`gameLink.ts`) só entrega o estado.
 */
export interface RoomMatchFields {
  /** Índice de `MATCH_PHASES`. */
  readonly phase: number
  /** `quantizePhaseLeft`: décimos de segundo, e o teto é a partida sem relógio. */
  readonly phaseLeftDs: number
  readonly arenaId: string
  /** Os votos à vista: de quem votou para o índice da opção (`mapVoteOptions`). */
  readonly ballots: ReadonlyMap<string, number>
  /** O índice da opção que venceu, ou -1 com o voto aberto. */
  readonly winner: number
  /** O mapa da próxima partida, com o voto fechado; vazio antes. */
  readonly nextArenaId: string
  /** O anfitrião da sala privada, vazio na pública; ausente num servidor de antes do voto de expulsão. */
  readonly hostId?: string
  /** O voto de expulsão aberto (`kickVoteView.ts`); ausente num servidor de antes dele. */
  readonly kickVote?: KickVoteFields
}

/** Os números do placar oficial de um jogador, como o estado da sala os traz. */
export interface OfficialScoreFields {
  readonly points: number
  readonly kills: number
  readonly deaths: number
  /** Os pontos da vida, que pagam as séries (ADR 0029). */
  readonly streakPoints: number
  /** O rtt que o próprio jogador relatou (`net.ping`), em ms; zero no bot e antes do relato. */
  readonly pingMs: number
}

/** A partida da sala já lida: a fase, os segundos que faltam nela, e o voto. */
export interface RoomMatchView {
  phase: MatchPhase
  phaseLeftS: number
  arenaId: string
  /** O índice da opção que venceu, ou `undefined` com o voto aberto. */
  winner: number | undefined
  /** O mapa da próxima partida, ou `undefined` com o voto aberto. */
  nextArenaId: string | undefined
}

export function createRoomMatchView(): RoomMatchView {
  return {
    phase: 'live',
    phaseLeftS: Number.POSITIVE_INFINITY,
    arenaId: '',
    winner: undefined,
    nextArenaId: undefined,
  }
}

/**
 * Lê os inteiros do fio em `into`, sem alocar: roda a cada quadro.
 *
 * ```ts
 * readRoomMatch(link.matchState(), view).phase // 'results'
 * ```
 */
export function readRoomMatch(
  fields: Readonly<RoomMatchFields>,
  into: RoomMatchView,
): RoomMatchView {
  into.phase = decodeMatchPhase(fields.phase)
  into.phaseLeftS = dequantizePhaseLeft(fields.phaseLeftDs)
  into.arenaId = fields.arenaId
  into.winner = fields.winner >= 0 ? fields.winner : undefined
  into.nextArenaId = fields.nextArenaId === '' ? undefined : fields.nextArenaId
  return into
}

/**
 * A partida no estado da sala, ou `undefined` antes do primeiro patch, ou de
 * um servidor sem ela.
 *
 * ```ts
 * const fields = matchStateOf(room.state)
 * ```
 */
export function matchStateOf(
  state: { readonly match?: RoomMatchFields } | undefined,
): RoomMatchFields | undefined {
  return state?.match
}

const NO_SCORES: ReadonlyMap<string, OfficialScoreFields> = new Map()

/**
 * O placar oficial de cada jogador da sala, pelo id da sala: os números moram
 * no mesmo `PlayerState` do corpo.
 *
 * ```ts
 * for (const [playerId, score] of officialScoresOf(room.state)) { ... }
 * ```
 */
export function officialScoresOf(
  state: { readonly players?: ReadonlyMap<string, OfficialScoreFields> } | undefined,
): ReadonlyMap<string, OfficialScoreFields> {
  return state?.players ?? NO_SCORES
}
