import {
  type Fighter,
  type KickVoteClosedMessage,
  type KickVoteRefusal,
  type KillEvent,
  type MatchCycleEdge,
  type MatchSummaryRow,
  type MedalAward,
  type RadarSweepMessage,
  type RoomKillMessage,
  roomMedalsOf,
  type ScorestreakActivatedMessage,
  type ScorestreakEarnedMessage,
  type ShotMessage,
  type Vector3,
  type WireInput,
} from '@shobu/core'
import type { MatchEndReason } from './roomMatch.ts'
import type { RoomIo, RoomSimulation } from './roomSimulation.ts'
import type { MatchStateFields, PlayerStateFields, RoomStateSink } from './roomState.ts'

/**
 * O colyseus do lado da sala, em memória, para os testes da sala e dos bots:
 * a fila de input por jogador, o rewind e os avisos. Sem posição rebobinada
 * marcada (`seenFeet`), o atirador vê o alvo onde o alvo está agora.
 *
 * ```ts
 * const io = new FakeRoomIo(room)
 * io.push('ana', fireInput)
 * stepRoom(room, io, rules)
 * ```
 */
export class FakeRoomIo implements RoomIo {
  readonly #queues = new Map<string, WireInput[]>()
  readonly seenFeet = new Map<string, Vector3>()
  /** Cada kill como foi para o fio, medalhas da sala incluídas. */
  readonly kills: RoomKillMessage[] = []
  readonly boundaryDeaths: string[] = []
  readonly shots: ShotMessage[] = []
  /** Os avisos de série pronta, como `dono:slot:série`: o fio só os manda ao dono. */
  readonly earned: string[] = []
  readonly activated: ScorestreakActivatedMessage[] = []
  /** Cada varredura de PING, com o dono: o fio só a manda a ele. */
  readonly sweeps: { playerId: string; sweep: RadarSweepMessage }[] = []
  readonly matchEdges: MatchCycleEdge[] = []
  /** Cada partida seguinte, como `mapa` ou `mapa:trocou`. */
  readonly nextMatches: string[] = []
  /** Cada resumo de fim de partida, com o porquê. */
  readonly summaries: { rows: readonly MatchSummaryRow[]; reason: MatchEndReason }[] = []
  /** Cada aviso de inatividade, como `jogador:segundos`. */
  readonly afkWarnings: string[] = []
  /** Quem saiu da sala por inatividade, na ordem. */
  readonly afkKicks: string[] = []
  /** Cada atraso parado jogado fora, como `jogador:quantos`. */
  readonly discarded: string[] = []
  /** Cada pedido de expulsão recusado, como `jogador:motivo`. */
  readonly kickRefusals: string[] = []
  /** Cada fim de voto de expulsão, como foi para todos. */
  readonly kickVotesClosed: KickVoteClosedMessage[] = []
  /** Cada expulsão, como `jogador:chave`. */
  readonly voteKicks: string[] = []

  constructor(readonly room: RoomSimulation) {}

  push(playerId: string, input: WireInput, times = 1): void {
    const queue = this.#queueOf(playerId)
    for (let index = 0; index < times; index += 1) queue.push(input)
  }

  remaining(playerId: string): number {
    return this.#queueOf(playerId).length
  }

  nextInput(playerId: string): WireInput | undefined {
    return this.#queueOf(playerId).shift()
  }

  pendingInputs(playerId: string): number {
    return this.remaining(playerId)
  }

  discardInputs(playerId: string, count: number): void {
    this.#queueOf(playerId).splice(0, count)
    this.discarded.push(`${playerId}:${count}`)
  }

  #queueOf(playerId: string): WireInput[] {
    const queue = this.#queues.get(playerId) ?? []
    this.#queues.set(playerId, queue)
    return queue
  }

  readonly feetSeenBy = (_shooterId: string, targetId: string, out: Vector3): Vector3 => {
    const now = (this.room.fighters.find((fighter) => fighter.id === targetId) as Fighter).body
    return Object.assign(out, this.seenFeet.get(targetId) ?? now.position)
  }

  readonly onKill = (kill: Readonly<KillEvent>, medals: readonly MedalAward[]): void => {
    this.kills.push({ ...kill, medals: roomMedalsOf(medals) })
  }

  readonly onBoundaryDeath = (playerId: string): void => {
    this.boundaryDeaths.push(playerId)
  }

  readonly onShot = (shot: Readonly<ShotMessage>): void => {
    this.shots.push({ ...shot, fromM: { ...shot.fromM }, toM: { ...shot.toM } })
  }

  readonly onScorestreakEarned = (
    playerId: string,
    earned: Readonly<ScorestreakEarnedMessage>,
  ): void => {
    this.earned.push(`${playerId}:${earned.slot}:${earned.scorestreak}`)
  }

  readonly onScorestreakActivated = (activated: Readonly<ScorestreakActivatedMessage>): void => {
    this.activated.push({ ...activated })
  }

  readonly onRadarSweep = (playerId: string, sweep: Readonly<RadarSweepMessage>): void => {
    this.sweeps.push({ playerId, sweep: { ...sweep } })
  }

  readonly onMatchEdge = (edge: MatchCycleEdge): void => {
    this.matchEdges.push(edge)
  }

  readonly onNextMatch = (arenaId: string, mapChanged: boolean): void => {
    this.nextMatches.push(mapChanged ? `${arenaId}:trocou` : arenaId)
  }

  readonly onMatchSummary = (rows: readonly MatchSummaryRow[], reason: MatchEndReason): void => {
    this.summaries.push({ rows, reason })
  }

  readonly onAfkWarning = (playerId: string, secondsLeft: number): void => {
    this.afkWarnings.push(`${playerId}:${secondsLeft}`)
  }

  readonly onAfkKick = (playerId: string): void => {
    this.afkKicks.push(playerId)
  }

  readonly onKickVoteRefused = (playerId: string, reason: KickVoteRefusal): void => {
    this.kickRefusals.push(`${playerId}:${reason}`)
  }

  readonly onKickVoteClosed = (closed: Readonly<KickVoteClosedMessage>): void => {
    this.kickVotesClosed.push({ ...closed })
  }

  readonly onVoteKick = (playerId: string, deviceKey: string): void => {
    this.voteKicks.push(`${playerId}:${deviceKey}`)
  }

  /** As kills como `atirador>vítima:arma`, que é como os testes as comparam. */
  killList(): string[] {
    return this.kills.map((kill) => `${kill.shooterId}>${kill.victimId}:${kill.weapon}`)
  }
}

/** O estado de um jogador antes da primeira escrita: tudo zerado. */
export function emptyPlayerState(): PlayerStateFields {
  return {
    x: 0,
    y: 0,
    z: 0,
    aimX: 0,
    aimY: 0,
    aimZ: 0,
    stance: 0,
    alive: false,
    name: '',
    primary: 0,
    skin: 0,
    finish: '',
    accent: 0,
    points: 0,
    kills: 0,
    deaths: 0,
    streakPoints: 0,
    pingMs: 0,
  }
}

/**
 * O estado da sala em memória: cria o do jogador na primeira escrita, guarda
 * quem saiu e a partida.
 *
 * ```ts
 * const sink = new FakeRoomStateSink()
 * writeRoomState(room, sink)
 * sink.match.phase // encodeMatchPhase('warmup')
 * ```
 */
export class FakeRoomStateSink implements RoomStateSink {
  readonly states = new Map<string, PlayerStateFields>()
  readonly dropped: string[] = []
  readonly match: MatchStateFields & {
    readonly ballots: Map<string, number>
    readonly kickVote: { readonly ballots: Map<string, number> }
  } = {
    phase: 0,
    phaseLeftDs: 0,
    arenaId: '',
    ballots: new Map(),
    winner: -1,
    nextArenaId: '',
    hostId: '',
    kickVote: {
      targetId: '',
      targetName: '',
      initiatorId: '',
      leftDs: 0,
      yes: 0,
      no: 0,
      needed: 0,
      ballots: new Map(),
    },
  }

  readonly matchState = (): MatchStateFields => this.match

  readonly stateOf = (playerId: string): PlayerStateFields | undefined => {
    const state = this.states.get(playerId) ?? emptyPlayerState()
    this.states.set(playerId, state)
    return state
  }

  readonly drop = (playerId: string): void => {
    this.states.delete(playerId)
    this.dropped.push(playerId)
  }
}
