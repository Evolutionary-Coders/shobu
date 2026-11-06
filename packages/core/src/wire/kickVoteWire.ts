import type { KickVoteOutcome, KickVoteRefusal } from '../room/kickVote.ts'

/**
 * O voto de expulsão no fio (ADR 0034). O estado do voto aberto vai no patch
 * da sala; as mensagens são só o pedido, o voto, a recusa e o fim.
 */

/** Do cliente para o servidor: abrir o voto contra um jogador, pelo id da sala. */
export const KICK_VOTE_START_MESSAGE = 'room.kick-vote.start'

export interface KickVoteStartMessage {
  readonly targetId: string
}

/** Do cliente para o servidor: SIM ou NÃO no voto aberto; votar de novo troca o voto. */
export const KICK_VOTE_BALLOT_MESSAGE = 'room.kick-vote.ballot'

export interface KickVoteBallotMessage {
  readonly yes: boolean
}

/** Do servidor só para quem pediu: por que o voto não abriu. */
export const KICK_VOTE_REFUSED_MESSAGE = 'room.kick-vote.refused'

export interface KickVoteRefusedMessage {
  readonly reason: KickVoteRefusal
}

/** Do servidor para todos: como o voto acabou, com o nome do alvo para a linha da tela. */
export const KICK_VOTE_CLOSED_MESSAGE = 'room.kick-vote.closed'

export interface KickVoteClosedMessage {
  readonly targetId: string
  readonly targetName: string
  readonly outcome: KickVoteOutcome
}

/**
 * O voto de cada eleitor no estado da sala (`KickVoteState.ballots`): ainda
 * não votou, SIM ou NÃO. O mapa leva só os eleitores, e é como o cliente sabe
 * se vota e se já votou; a tela só mostra as contagens.
 */
export const KICK_BALLOT_PENDING = 0
export const KICK_BALLOT_YES = 1
export const KICK_BALLOT_NO = 2

/**
 * O código com que a sala fecha a conexão de quem o voto (ou o anfitrião)
 * expulsou: é por ele que o menu diz por que o jogador saiu. Fora da faixa do
 * colyseus (4000–4010), do `AFK_CLOSE_CODE` e do `PAGE_RELOAD_CLOSE_CODE`.
 */
export const KICK_CLOSE_CODE = 4102

/** O maior id de jogador que a sala aceita da rede: o `sessionId` do colyseus é bem menor. */
const PLAYER_ID_MAX_LENGTH = 64

/**
 * O alvo do pedido que veio da rede, ou `undefined` se não for um id de
 * jogador plausível.
 *
 * ```ts
 * kickTargetOf({ targetId: 'aB3xYz' }) // 'aB3xYz'
 * ```
 */
export function kickTargetOf(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const { targetId } = raw as { targetId?: unknown }
  if (typeof targetId !== 'string') return undefined
  if (targetId.length === 0 || targetId.length > PLAYER_ID_MAX_LENGTH) return undefined
  return targetId
}

/**
 * O voto que veio da rede, ou `undefined` se não for um booleano.
 *
 * ```ts
 * kickBallotOf({ yes: false }) // false
 * ```
 */
export function kickBallotOf(raw: unknown): boolean | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const { yes } = raw as { yes?: unknown }
  return typeof yes === 'boolean' ? yes : undefined
}

/**
 * A chave do aparelho, ou `''` quando não vale: um `randomUUID` que a página
 * guarda e manda na entrada. É ela que o banimento da sala reconhece, e não o
 * ip, que o estande inteiro divide (ADR 0034).
 *
 * ```ts
 * parseDeviceKey('3f1c2b8e-9a7d-4c1e-8b2a-6d5e4f3a2b1c') // a mesma
 * parseDeviceKey('<script>') // ''
 * ```
 */
export function parseDeviceKey(raw: unknown): string {
  return typeof raw === 'string' && DEVICE_KEY.test(raw) ? raw : ''
}

const DEVICE_KEY = /^[0-9a-f-]{16,64}$/
