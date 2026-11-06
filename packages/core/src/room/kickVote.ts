import { isSquadBotId } from '../bots/botSquad.ts'
import type { RoomVisibility } from './roomEntry.ts'

/**
 * O voto de expulsão (ADR 0034), sem o colyseus: quem pode abrir, quem vota,
 * quantos SIM bastam e quando o voto fecha. Na sala pública, a maioria estrita
 * dos outros humanos presentes na abertura decide; na privada, o anfitrião
 * expulsa sem voto. Puro e sem relógio próprio: o `nowS` é o da sala.
 */

/** Por que o pedido de expulsão não abriu voto nenhum. */
export type KickVoteRefusal =
  | 'not-enough-humans'
  | 'target-is-bot'
  | 'target-is-self'
  | 'target-not-seated'
  | 'vote-in-progress'
  | 'cooldown'
  | 'target-protected'
  | 'join-grace'
  | 'not-host'
  | 'not-present'

/** Como o voto acabou: só `passed` expulsa; `cancelled` não protege nem bane. */
export type KickVoteOutcome = 'passed' | 'failed' | 'cancelled'

/** Os tempos e o mínimo de humanos, da seção `match` da configuração. */
export interface KickVoteRules {
  readonly kickVoteWindowS: number
  readonly kickVoteCooldownS: number
  readonly kickVoteProtectionS: number
  readonly kickVoteJoinGraceS: number
  readonly kickVoteMinHumans: number
}

/** Um voto aberto. Os eleitores são fixos na abertura: quem chega depois não vota. */
export interface KickVote {
  readonly targetId: string
  readonly initiatorId: string
  readonly openedAtS: number
  readonly electorate: ReadonlySet<string>
  /** Eleitor → SIM ou NÃO; quem abriu já entra como SIM. */
  readonly ballots: Map<string, boolean>
}

/** O voto de agora e as recargas, um por sala. */
export interface KickVoteBook {
  vote: KickVote | undefined
  /** Quem abriu um voto só abre outro depois deste instante. */
  readonly cooldownUntilS: Map<string, number>
  /** O alvo de um voto que falhou não é votado de novo antes deste instante. */
  readonly protectedUntilS: Map<string, number>
}

/** Um humano sentado, na ordem de entrada. */
export interface KickRoomHuman {
  readonly id: string
  readonly seatedAtS: number
  /** Fora de `away` e de `awaitsControl`: está jogando. */
  readonly present: boolean
}

/** O que o voto lê da sala: os humanos, na ordem de entrada, e a visibilidade. */
export interface KickRoomView {
  readonly humans: readonly KickRoomHuman[]
  readonly visibility: RoomVisibility
}

/** O pedido de expulsão: quem pede, contra quem, e quando. */
export interface KickRequest {
  readonly initiatorId: string
  readonly targetId: string
  readonly nowS: number
}

/** O que o pedido virou: um voto aberto, a expulsão do anfitrião, ou a recusa. */
export type KickRequestResult =
  | { readonly kind: 'opened'; readonly vote: KickVote }
  | { readonly kind: 'kick-now'; readonly targetId: string }
  | { readonly kind: 'refused'; readonly reason: KickVoteRefusal }

/** Como o voto está depois deste tick. */
export type KickVoteVerdict =
  | {
      readonly kind: 'open'
      readonly yes: number
      readonly no: number
      readonly needed: number
      readonly leftS: number
    }
  | { readonly kind: 'closed'; readonly outcome: KickVoteOutcome }

/**
 * O livro vazio da sala nova.
 *
 * ```ts
 * const book = createKickVoteBook() // { vote: undefined, ... }
 * ```
 */
export function createKickVoteBook(): KickVoteBook {
  return { vote: undefined, cooldownUntilS: new Map(), protectedUntilS: new Map() }
}

/**
 * Quantos SIM bastam entre `eligible` eleitores: a maioria estrita.
 *
 * ```ts
 * kickVotesNeeded(3) // 2
 * ```
 */
export function kickVotesNeeded(eligible: number): number {
  return Math.floor(eligible / 2) + 1
}

/**
 * O anfitrião da sala privada: o humano sentado há mais tempo, que é o
 * primeiro na ordem de entrada. Quando ele sai, o próximo herda. A sala
 * pública não tem.
 *
 * ```ts
 * hostOf({ visibility: 'private', humans: [ana, bia] }) // 'ana'
 * ```
 */
export function hostOf(view: KickRoomView): string | undefined {
  if (view.visibility !== 'private') return undefined
  return view.humans[0]?.id
}

/**
 * O pedido de expulsão: na sala privada, o anfitrião expulsa na hora; na
 * pública, abre o voto, e o livro passa a guardá-lo, com a recarga de quem
 * abriu já correndo.
 *
 * ```ts
 * requestKick(book, view, config.match, { initiatorId: 'ana', targetId: 'bia', nowS: 30 })
 * // { kind: 'opened', vote }
 * ```
 */
export function requestKick(
  book: KickVoteBook,
  view: KickRoomView,
  rules: KickVoteRules,
  request: KickRequest,
): KickRequestResult {
  const refusal = seatRefusalOf(view, request)
  if (refusal) return { kind: 'refused', reason: refusal }
  if (view.visibility === 'private') return hostKickOf(view, request)
  const voteRefusal = voteRefusalOf(book, view, rules, request)
  if (voteRefusal) return { kind: 'refused', reason: voteRefusal }
  return { kind: 'opened', vote: openKickVote(book, view, rules, request) }
}

/** Quem pede e o alvo: o que vale em qualquer sala. */
function seatRefusalOf(view: KickRoomView, request: KickRequest): KickVoteRefusal | undefined {
  const initiator = view.humans.find((human) => human.id === request.initiatorId)
  if (!initiator?.present) return 'not-present'
  if (request.targetId === request.initiatorId) return 'target-is-self'
  if (view.humans.some((human) => human.id === request.targetId)) return undefined
  return isSquadBotId(request.targetId) ? 'target-is-bot' : 'target-not-seated'
}

function hostKickOf(view: KickRoomView, request: KickRequest): KickRequestResult {
  if (hostOf(view) !== request.initiatorId) return { kind: 'refused', reason: 'not-host' }
  return { kind: 'kick-now', targetId: request.targetId }
}

/** O que só vale para o voto da sala pública, na ordem em que a tela explica. */
function voteRefusalOf(
  book: KickVoteBook,
  view: KickRoomView,
  rules: KickVoteRules,
  { initiatorId, targetId, nowS }: KickRequest,
): KickVoteRefusal | undefined {
  if (view.humans.length < rules.kickVoteMinHumans) return 'not-enough-humans'
  if (electorateOf(view, targetId).size < 2) return 'not-enough-humans'
  if (book.vote) return 'vote-in-progress'
  const initiator = view.humans.find((human) => human.id === initiatorId) as KickRoomHuman
  if (nowS - initiator.seatedAtS < rules.kickVoteJoinGraceS) return 'join-grace'
  if ((book.cooldownUntilS.get(initiatorId) ?? 0) > nowS) return 'cooldown'
  if ((book.protectedUntilS.get(targetId) ?? 0) > nowS) return 'target-protected'
  return undefined
}

/** Os humanos presentes, menos o alvo: quem vota. */
function electorateOf(view: KickRoomView, targetId: string): Set<string> {
  const ids = view.humans.filter((human) => human.present && human.id !== targetId)
  return new Set(ids.map((human) => human.id))
}

function openKickVote(
  book: KickVoteBook,
  view: KickRoomView,
  rules: KickVoteRules,
  { initiatorId, targetId, nowS }: KickRequest,
): KickVote {
  // as recargas vencidas saem aqui: o livro não cresce com quem já foi embora.
  pruneExpired(book.cooldownUntilS, nowS)
  pruneExpired(book.protectedUntilS, nowS)
  const vote: KickVote = {
    targetId,
    initiatorId,
    openedAtS: nowS,
    electorate: electorateOf(view, targetId),
    ballots: new Map([[initiatorId, true]]),
  }
  book.vote = vote
  book.cooldownUntilS.set(initiatorId, nowS + rules.kickVoteCooldownS)
  return vote
}

function pruneExpired(untilS: Map<string, number>, nowS: number): void {
  for (const [id, until] of untilS) if (until <= nowS) untilS.delete(id)
}

/**
 * O voto de um eleitor; votar de novo troca o voto. Quem não está entre os
 * eleitores da abertura — o alvo, quem chegou depois — não vota: `false`.
 *
 * ```ts
 * castKickBallot(vote, 'bia', false) // true
 * ```
 */
export function castKickBallot(vote: KickVote, voterId: string, yes: boolean): boolean {
  if (!vote.electorate.has(voterId)) return false
  vote.ballots.set(voterId, yes)
  return true
}

/**
 * O voto agora: cancelado se quem abriu ou o alvo saiu, ou se sobram menos de
 * dois eleitores; passado assim que o SIM basta; falho quando o SIM não chega
 * mais ou a janela acaba. Quem saiu deixa de contar, e o necessário é refeito.
 *
 * ```ts
 * kickVoteVerdict(vote, new Set(['ana', 'bia', 'caio']), 31, config.match)
 * // { kind: 'open', yes: 1, no: 0, needed: 2, leftS: 19 }
 * ```
 */
export function kickVoteVerdict(
  vote: KickVote,
  presentIds: ReadonlySet<string>,
  nowS: number,
  rules: KickVoteRules,
): KickVoteVerdict {
  if (!presentIds.has(vote.initiatorId) || !presentIds.has(vote.targetId)) return cancelled
  const eligible = [...vote.electorate].filter((id) => presentIds.has(id))
  if (eligible.length < 2) return cancelled
  const needed = kickVotesNeeded(eligible.length)
  const yes = eligible.filter((id) => vote.ballots.get(id) === true).length
  const no = eligible.filter((id) => vote.ballots.get(id) === false).length
  if (yes >= needed) return { kind: 'closed', outcome: 'passed' }
  const leftS = vote.openedAtS + rules.kickVoteWindowS - nowS
  if (eligible.length - no < needed || leftS <= 0) return { kind: 'closed', outcome: 'failed' }
  return { kind: 'open', yes, no, needed, leftS }
}

const cancelled: KickVoteVerdict = { kind: 'closed', outcome: 'cancelled' }

/**
 * Fecha o voto do livro. O que falhou protege o alvo por `kickVoteProtectionS`:
 * sem isto, a sala revezaria quem abre contra o mesmo jogador.
 *
 * ```ts
 * closeKickVote(book, 'failed', room.matchTimeS, config.match)
 * ```
 */
export function closeKickVote(
  book: KickVoteBook,
  outcome: KickVoteOutcome,
  nowS: number,
  rules: KickVoteRules,
): void {
  const vote = book.vote
  book.vote = undefined
  if (!vote || outcome !== 'failed') return
  book.protectedUntilS.set(vote.targetId, nowS + rules.kickVoteProtectionS)
}
