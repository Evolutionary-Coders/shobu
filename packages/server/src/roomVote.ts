import {
  BOT_BALLOT_WINDOW,
  ballotsCastBy,
  botBallots,
  castBallot,
  decideMapVote,
  isBenched,
  MATCH_SEED_BASE,
  type MapBallot,
  type MapVoteOutcome,
  mapVoteOptions,
} from '@shobu/core'
import type { RoomSimulation } from './roomSimulation.ts'

/**
 * O voto do próximo mapa na sala (ADR 0031): as regras são as do núcleo
 * (`mapVote.ts`), as mesmas do cliente offline. O voto de cada humano chega
 * como mensagem (`MAP_VOTE_MESSAGE`); o dos bots sentados sai da semente.
 */
export interface RoomVote {
  /** Os mapas do catálogo, na ordem dele, e por último o ALEATÓRIO. */
  readonly options: readonly string[]
  readonly seed: number
  ballots: readonly MapBallot[]
  /** O voto fechado, com o índice da opção que venceu, para a tela destacá-la. */
  outcome: RoomVoteOutcome | undefined
}

export interface RoomVoteOutcome extends MapVoteOutcome {
  readonly winner: number
}

const NO_BALLOTS: readonly MapBallot[] = []

/** Um primo, para a semente de uma partida não cair na sequência da seguinte. */
const MATCH_SEED_STRIDE = 7_919

/**
 * Abre o voto quando a tela de resultado aparece: os bots sentados já com o
 * voto agendado na janela deles. A semente muda a cada partida e a cada mapa,
 * para a sala não votar sempre igual.
 *
 * ```ts
 * room.match.vote = openRoomVote(room)
 * ```
 */
export function openRoomVote(room: RoomSimulation): RoomVote {
  const catalogIds = [...room.arenas.keys()]
  const options = mapVoteOptions(catalogIds)
  const arenaIndex = catalogIds.indexOf(room.rules.arenaId)
  const seed = MATCH_SEED_BASE + room.match.serial * MATCH_SEED_STRIDE + arenaIndex
  const botIds = room.bots.squad.bots.filter((bot) => !isBenched(bot)).map((bot) => bot.id)
  const ballots = botBallots(botIds, options, seed, BOT_BALLOT_WINDOW)
  return { options, seed, ballots, outcome: undefined }
}

/**
 * O voto de um jogador (`MAP_VOTE_MESSAGE`). Vem da rede: só vale com o voto
 * aberto, de quem está sentado, e num índice inteiro das opções. O recusado
 * devolve `false`, para o adapter registrar.
 *
 * ```ts
 * if (!castRoomVote(room, client.sessionId, message?.optionIndex)) log(...)
 * ```
 */
export function castRoomVote(room: RoomSimulation, playerId: string, raw: unknown): boolean {
  const { vote, cycle } = room.match
  if (!vote || vote.outcome || cycle.phase !== 'results') return false
  if (!room.seats.has(playerId) || !Number.isInteger(raw)) return false
  const optionId = vote.options[raw as number]
  if (optionId === undefined) return false
  vote.ballots = castBallot(vote.ballots, { voterId: playerId, optionId, atS: cycle.phaseS })
  return true
}

/**
 * Fecha o voto quando a tela de resultado acaba. Conta só o que chegou até
 * ali: com a tela mais curta que a janela dos bots, o voto que a tela não
 * mostrou não decide.
 *
 * ```ts
 * closeRoomVote(room)?.mapId // 'ichiban-gai'
 * ```
 */
export function closeRoomVote(room: RoomSimulation): RoomVoteOutcome | undefined {
  const { vote, config } = room.match
  if (!vote) return undefined
  const counted = ballotsCastBy(vote.ballots, config.resultsS)
  const outcome = decideMapVote(vote.options, counted, vote.seed)
  vote.outcome = { ...outcome, winner: vote.options.indexOf(outcome.optionId) }
  return vote.outcome
}

/**
 * Os votos que a tela mostra agora: na tela de resultado, os que já chegaram;
 * depois dela, os que contaram.
 *
 * ```ts
 * for (const ballot of visibleRoomBallots(room)) out.set(ballot.voterId, ...)
 * ```
 */
export function visibleRoomBallots(room: RoomSimulation): readonly MapBallot[] {
  const { vote, cycle, config } = room.match
  if (!vote) return NO_BALLOTS
  const nowS = cycle.phase === 'results' ? cycle.phaseS : config.resultsS
  return ballotsCastBy(vote.ballots, nowS)
}
