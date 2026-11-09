import {
  castKickBallot,
  closeKickVote,
  createKickVoteBook,
  type KickRoomView,
  type KickVoteBook,
  type KickVoteOutcome,
  type KickVoteRefusal,
  type KickVoteVerdict,
  kickBallotOf,
  kickTargetOf,
  kickVoteVerdict,
  type RoomVisibility,
  requestKick,
} from '@shobu/core'
import type { RoomSeat } from './roomSeat.ts'
import type { RoomIo, RoomSimulation } from './roomSimulation.ts'

/**
 * O voto de expulsão na sala (ADR 0034): as regras são as do núcleo
 * (`kickVote.ts`); aqui mora o que a sala sabe — quem está sentado, desde
 * quando, se está presente, como se chama — e o que ela avisa. O pedido e o
 * voto chegam como mensagem, fora do tick; a recusa e a expulsão do anfitrião
 * esperam o tick seguinte (`stepRoomKickVote`), que é onde a sala fala.
 */
export interface RoomKick extends KickVoteBook {
  /** Pública até o `onCreate` perguntar ao matchmaking (`visibilityOf`). */
  visibility: RoomVisibility
  /** O nome do alvo do voto aberto, para a linha do fim mesmo depois de ele sair. */
  targetName: string
  /** As recusas que o tick ainda não mandou, uma por pedido. */
  readonly refusals: { readonly playerId: string; readonly reason: KickVoteRefusal }[]
  /** Os alvos que o anfitrião já tirou, à espera do tick. */
  readonly hostKicks: string[]
}

/**
 * O voto de expulsão da sala nova: sem voto, pública.
 *
 * ```ts
 * const room = { ...outros, kick: createRoomKick() }
 * ```
 */
export function createRoomKick(): RoomKick {
  return {
    ...createKickVoteBook(),
    visibility: 'public',
    targetName: '',
    refusals: [],
    hostKicks: [],
  }
}

/**
 * O pedido de expulsão que veio da rede (`KICK_VOTE_START_MESSAGE`). Só o
 * corpo malformado devolve `false`, para o adapter registrar; a recusa das
 * regras vai a quem pediu no tick.
 *
 * ```ts
 * if (!requestRoomKick(room, client.sessionId, message)) log(...)
 * ```
 */
export function requestRoomKick(room: RoomSimulation, initiatorId: string, raw: unknown): boolean {
  const targetId = kickTargetOf(raw)
  if (targetId === undefined) return false
  const nowS = room.matchTimeS
  const result = requestKick(room.kick, kickRoomViewOf(room), room.rules.config.match, {
    initiatorId,
    targetId,
    nowS,
  })
  if (result.kind === 'refused')
    room.kick.refusals.push({ playerId: initiatorId, reason: result.reason })
  if (result.kind === 'kick-now') room.kick.hostKicks.push(targetId)
  if (result.kind === 'opened') room.kick.targetName = callsignOf(room, targetId)
  return true
}

/**
 * O SIM ou NÃO que veio da rede (`KICK_VOTE_BALLOT_MESSAGE`). `false` sem voto
 * aberto, de quem não vota nele, ou com o corpo malformado.
 *
 * ```ts
 * if (!castRoomKickBallot(room, client.sessionId, message)) log(...)
 * ```
 */
export function castRoomKickBallot(room: RoomSimulation, voterId: string, raw: unknown): boolean {
  const yes = kickBallotOf(raw)
  const vote = room.kick.vote
  if (yes === undefined || !vote) return false
  return castKickBallot(vote, voterId, yes)
}

/**
 * O passo do voto, uma vez por tick: manda as recusas, tira quem o anfitrião
 * expulsou e fecha o voto que acabou. Vale em qualquer fase: expulsar no
 * intervalo é igual.
 *
 * ```ts
 * stepRoomKickVote(room, io) // no fim do `stepRoom`
 * ```
 */
export function stepRoomKickVote(room: RoomSimulation, io: RoomIo): void {
  const { kick } = room
  for (const { playerId, reason } of kick.refusals.splice(0)) io.onKickVoteRefused(playerId, reason)
  for (const targetId of kick.hostKicks.splice(0)) expel(room, io, targetId)
  const verdict = roomKickVerdict(room)
  if (verdict?.kind !== 'closed') return
  finishRoomKickVote(room, io, verdict.outcome)
}

/**
 * Como o voto aberto está agora, ou `undefined` sem voto: o que o estado da
 * sala escreve (`writeRoomState`) e o que o tick confere.
 *
 * ```ts
 * roomKickVerdict(room) // { kind: 'open', yes: 1, no: 0, needed: 2, leftS: 19 }
 * ```
 */
export function roomKickVerdict(room: RoomSimulation): KickVoteVerdict | undefined {
  const vote = room.kick.vote
  if (!vote) return undefined
  return kickVoteVerdict(vote, presentIdsOf(room), room.matchTimeS, room.rules.config.match)
}

function finishRoomKickVote(room: RoomSimulation, io: RoomIo, outcome: KickVoteOutcome): void {
  const { targetId } = room.kick.vote as { targetId: string }
  const targetName = room.kick.targetName
  closeKickVote(room.kick, outcome, room.matchTimeS, room.rules.config.match)
  if (outcome === 'passed') {
    expel(room, io, targetId)
    return
  }
  io.onKickVoteClosed({ targetId, targetName, outcome })
}

/** O fim para todos e a saída do alvo, se ele ainda está sentado. */
function expel(room: RoomSimulation, io: RoomIo, targetId: string): void {
  const seat = room.seats.get(targetId)
  if (!seat) return
  io.onKickVoteClosed({ targetId, targetName: seat.callsign, outcome: 'passed' })
  io.onVoteKick(targetId, seat.deviceKey)
}

/**
 * Os humanos da sala para o núcleo, na ordem de entrada, que é a do `Map`
 * dos assentos: o primeiro é o anfitrião da sala privada.
 *
 * ```ts
 * hostOf(kickRoomViewOf(room)) // 'ana' na sala privada dela
 * ```
 */
export function kickRoomViewOf(room: RoomSimulation): KickRoomView {
  const humans = [...room.seats].map(([id, seat]) => ({
    id,
    seatedAtS: seat.seatedAtS,
    present: isPresent(seat),
  }))
  return { humans, visibility: room.kick.visibility }
}

/** Quem está jogando: nem recarregando o mapa novo, nem no CLIQUE PARA ENTRAR. */
function isPresent(seat: RoomSeat): boolean {
  return !seat.away && !seat.awaitsControl
}

function presentIdsOf(room: RoomSimulation): Set<string> {
  const ids = [...room.seats].filter(([, seat]) => isPresent(seat)).map(([id]) => id)
  return new Set(ids)
}

function callsignOf(room: RoomSimulation, playerId: string): string {
  return (room.seats.get(playerId) as RoomSeat).callsign
}
