import { hostOf, KICK_BALLOT_CAST, KICK_BALLOT_PENDING } from '@shobu/core'
import { kickRoomViewOf, roomKickVerdict } from './roomKickVote.ts'
import type { RoomSimulation } from './roomSimulation.ts'

/**
 * O voto de expulsão aberto no estado da sala (ADR 0034): quem quer abrir o
 * voto lê o anfitrião, e quem vota lê o alvo, o tempo e as contagens. Vai no
 * patch, e não em mensagem, para quem entra no meio do voto já o ver.
 */

/** Os campos do `KickVoteState` do schema; o schema os satisfaz por estrutura. */
export interface KickVoteStateFields {
  /** Vazio sem voto aberto. */
  targetId: string
  targetName: string
  initiatorId: string
  /** O que falta da janela, em décimos de segundo. */
  leftDs: number
  yes: number
  no: number
  needed: number
  /**
   * Cada eleitor da abertura que ainda está na sala, e se já votou
   * (`KICK_BALLOT_*`): é como o cliente sabe se vota e se já votou. O SIM ou
   * NÃO de cada um não vai no patch, que todo cliente lê: só as contagens.
   */
  readonly ballots: KickBallotFields
}

/** O mapa de eleitores do schema; um `Map` serve. */
export interface KickBallotFields {
  readonly size: number
  get(voterId: string): number | undefined
  set(voterId: string, ballot: number): unknown
  delete(voterId: string): unknown
  keys(): Iterable<string>
  clear(): void
}

/** O pedaço do `MatchState` que o voto de expulsão escreve. */
export interface KickStateFields {
  hostId: string
  readonly kickVote: KickVoteStateFields
}

/**
 * Escreve o anfitrião, vazio na sala pública, e o voto aberto, ou o apaga.
 *
 * ```ts
 * writeKickVoteState(room, state.match)
 * ```
 */
export function writeKickVoteState(room: RoomSimulation, match: KickStateFields): void {
  match.hostId = hostOf(kickRoomViewOf(room)) ?? ''
  const out = match.kickVote
  const vote = room.kick.vote
  const verdict = roomKickVerdict(room)
  if (!vote || verdict?.kind !== 'open') {
    clearKickVoteState(out)
    return
  }
  out.targetId = vote.targetId
  out.targetName = room.kick.targetName
  out.initiatorId = vote.initiatorId
  out.leftDs = Math.ceil(verdict.leftS * 10)
  out.yes = verdict.yes
  out.no = verdict.no
  out.needed = verdict.needed
  writeKickBallots(room, vote.electorate, vote.ballots, out.ballots)
}

function clearKickVoteState(out: KickVoteStateFields): void {
  out.targetId = ''
  out.targetName = ''
  out.initiatorId = ''
  out.leftDs = 0
  out.yes = 0
  out.no = 0
  out.needed = 0
  if (out.ballots.size > 0) out.ballots.clear()
}

/** Cada eleitor ainda sentado, se já votou, e fora quem saiu. */
function writeKickBallots(
  room: RoomSimulation,
  electorate: ReadonlySet<string>,
  ballots: ReadonlyMap<string, boolean>,
  out: KickBallotFields,
): void {
  const seated = [...electorate].filter((id) => room.seats.has(id))
  for (const id of seated) {
    const value = ballotCodeOf(ballots.get(id))
    if (out.get(id) !== value) out.set(id, value)
  }
  // a cópia: apagar no meio da iteração do `MapSchema` não é o que ele promete.
  for (const id of [...out.keys()]) if (!seated.includes(id)) out.delete(id)
}

function ballotCodeOf(ballot: boolean | undefined): number {
  return ballot === undefined ? KICK_BALLOT_PENDING : KICK_BALLOT_CAST
}
