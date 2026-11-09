import {
  type CosmeticLoadoutMessage,
  createKillEvent,
  type KickVoteClosedMessage,
  type KickVoteRefusal,
  type MatchSummaryRow,
  quantizePositionM,
  type RadarSweepMessage,
  type RoomKillMessage,
  type ScorestreakActivatedMessage,
  type ScorestreakEarnedMessage,
  type ScorestreakSlug,
  type ShotMessage,
  type WireInput,
} from '@shobu/core'
import type { GameLink } from './gameLink.ts'
import type { PlayerSnapshotFields } from './remotePlayerView.ts'
import type { OfficialScoreFields, RoomMatchFields } from './roomMatchView.ts'

/**
 * A sala do colyseus para os testes da porta de rede (`networkPort.ts`), em
 * memória: guarda o que recebeu, devolve um jogador remoto, e cada método de
 * aviso tem o gêmeo que o teste chama para a sala "falar".
 *
 * ```ts
 * const link = new FakeGameLink()
 * createNetworkPort().attach(link)
 * link.confirmKill('bot-0')
 * ```
 */
/**
 * O ouvinte de antes de alguém ouvir, e o dos avisos que a porta não escuta
 * (a troca de sala, a voz): a sala fala, e ninguém está lá.
 */
function unheard(): void {}

export const WALK: WireInput = { wishX: 0, wishZ: -127, buttons: 0, aimX: 0, aimY: 0, aimZ: -32767 }
export const AT_SPAWN: PlayerSnapshotFields = {
  x: quantizePositionM(26),
  y: 0,
  z: quantizePositionM(26),
  aimX: 0,
  aimY: 0,
  aimZ: -32767,
  stance: 4,
  alive: true,
  name: 'BIA',
  primary: 1,
  skin: 1,
  finish: 'carbono',
  accent: 2,
}

/** A sala do colyseus, em memória: guarda o que recebeu e devolve um jogador remoto. */
export class FakeGameLink implements GameLink {
  readonly sessionId = 'eu'
  readonly address = '203.0.113.7'
  readonly arenaId = 'neon-kaido'
  refusedAddress: string | undefined = undefined
  readonly sent: WireInput[] = []

  sendTickInput(input: WireInput): number {
    this.sent.push({ ...input })
    return this.sent.length
  }

  acked = 0
  rtt = 0

  rttMs(): number {
    return this.rtt
  }

  lastProcessed(): number {
    return this.acked
  }

  forEachRemote(
    _nowMs: number,
    visit: (playerId: string, fields: PlayerSnapshotFields) => void,
  ): void {
    visit('outro', AT_SPAWN)
  }

  own: PlayerSnapshotFields | undefined = undefined
  /** Os nomes do estado da sala, pelo id da sala. */
  readonly names = new Map<string, string>()

  forEachPlayerName(visit: (playerId: string, name: string) => void): void {
    for (const [playerId, name] of this.names) visit(playerId, name)
  }

  ownSnapshot(): PlayerSnapshotFields | undefined {
    return this.own
  }

  #killListener: (kill: RoomKillMessage) => void = unheard

  onKill(listener: (kill: RoomKillMessage) => void): void {
    this.#killListener = listener
  }

  /** O servidor confirmando uma kill deste jogador. */
  confirmKill(victimId: string): void {
    this.#killListener({ ...createKillEvent(), shooterId: 'local', victimId })
  }

  #boundaryListener: (playerId: string) => void = unheard

  onBoundaryDeath(listener: (playerId: string) => void): void {
    this.#boundaryListener = listener
  }

  /** O servidor avisando que alguém morreu fora da área. */
  boundaryDeath(playerId: string): void {
    this.#boundaryListener(playerId)
  }

  #shotListener: (shot: ShotMessage) => void = unheard

  onShot(listener: (shot: ShotMessage) => void): void {
    this.#shotListener = listener
  }

  /** O servidor avisando de um tiro. */
  shot(shooterId: string): void {
    const fromM = { x: 0, y: 1.6, z: 0 }
    this.#shotListener({ shooterId, fromM, toM: { x: 0, y: 1.6, z: -30 }, hitFighter: false })
  }

  readonly loadouts: string[] = []
  readonly primaries: string[] = []
  readonly callsigns: string[] = []

  sendPrimary(primaryWeapon: string): void {
    this.primaries.push(primaryWeapon)
  }

  sendCallsign(callsign: string): void {
    this.callsigns.push(callsign)
  }

  readonly cosmetics: CosmeticLoadoutMessage[] = []

  sendCosmetics(look: CosmeticLoadoutMessage): void {
    this.cosmetics.push(look)
  }

  /** Quantas vezes o jogador disse à sala que pegou o controle. */
  inControlSent = 0

  sendInControl(): void {
    this.inControlSent += 1
  }

  sendLoadout(meleeWeapon: string): void {
    this.loadouts.push(meleeWeapon)
  }

  readonly scorestreakLoadouts: (readonly ScorestreakSlug[])[] = []
  readonly activations: number[] = []

  sendScorestreaks(scorestreaks: readonly ScorestreakSlug[]): void {
    this.scorestreakLoadouts.push(scorestreaks)
  }

  sendScorestreakActivation(slot: number): void {
    this.activations.push(slot)
  }

  #earnedListener: (earned: ScorestreakEarnedMessage) => void = unheard

  onScorestreakEarned(listener: (earned: ScorestreakEarnedMessage) => void): void {
    this.#earnedListener = listener
  }

  /** A sala avisando que este jogador ganhou a série do slot. */
  earn(slot: number, scorestreak: ScorestreakSlug): void {
    this.#earnedListener({ slot, scorestreak })
  }

  #activatedListener: (activated: ScorestreakActivatedMessage) => void = unheard

  onScorestreakActivated(listener: (activated: ScorestreakActivatedMessage) => void): void {
    this.#activatedListener = listener
  }

  /** A sala avisando que alguém acionou uma série. */
  activate(playerId: string, slot: number, scorestreak: ScorestreakSlug): void {
    this.#activatedListener({ playerId, slot, scorestreak })
  }

  #sweepListener: (sweep: RadarSweepMessage) => void = unheard

  onRadarSweep(listener: (sweep: RadarSweepMessage) => void): void {
    this.#sweepListener = listener
  }

  /** A sala mandando a varredura do PING ou do SONAR deste jogador. */
  sweep(blips: RadarSweepMessage['blips'], pulseLeftS: number, revealS: number): void {
    this.#sweepListener({ blips, pulseLeftS, revealS })
  }

  readonly onMove = unheard
  readonly onVoiceTicket = unheard
  readonly reconnectionToken = 'token-de-volta'

  match: RoomMatchFields | undefined = undefined

  matchState(): RoomMatchFields | undefined {
    return this.match
  }

  readonly scores = new Map<string, OfficialScoreFields>()

  forEachScore(visit: (playerId: string, score: OfficialScoreFields) => void): void {
    for (const [playerId, score] of this.scores) visit(playerId, score)
  }

  #summaryListener: (rows: readonly MatchSummaryRow[]) => void = unheard

  onMatchSummary(listener: (rows: readonly MatchSummaryRow[]) => void): void {
    this.#summaryListener = listener
  }

  /** A sala mandando o resumo da partida que acabou. */
  summarize(rows: readonly MatchSummaryRow[]): void {
    this.#summaryListener(rows)
  }

  readonly votes: number[] = []

  sendMapVote(optionIndex: number): void {
    this.votes.push(optionIndex)
  }

  readonly pings: number[] = []

  #afkListener: (secondsLeft: number) => void = unheard

  onAfkWarning(listener: (secondsLeft: number) => void): void {
    this.#afkListener = listener
  }

  /** A sala avisando que este jogador está parado. */
  warnAfk(secondsLeft: number): void {
    this.#afkListener(secondsLeft)
  }

  sendPing(rttMs: number): void {
    this.pings.push(rttMs)
  }

  readonly kickVotesStarted: string[] = []
  readonly kickBallots: boolean[] = []

  startKickVote(targetId: string): void {
    this.kickVotesStarted.push(targetId)
  }

  castKickBallot(yes: boolean): void {
    this.kickBallots.push(yes)
  }

  #kickRefusedListener: (reason: KickVoteRefusal) => void = unheard

  onKickVoteRefused(listener: (reason: KickVoteRefusal) => void): void {
    this.#kickRefusedListener = listener
  }

  /** A sala recusando o pedido de expulsão deste jogador. */
  refuseKick(reason: KickVoteRefusal): void {
    this.#kickRefusedListener(reason)
  }

  #kickClosedListener: (closed: KickVoteClosedMessage) => void = unheard

  onKickVoteClosed(listener: (closed: KickVoteClosedMessage) => void): void {
    this.#kickClosedListener = listener
  }

  /** A sala avisando que um voto de expulsão acabou. */
  closeKickVote(closed: KickVoteClosedMessage): void {
    this.#kickClosedListener(closed)
  }

  #closeListener: (code: number | undefined) => void = unheard

  onClose(listener: (code: number | undefined) => void): void {
    this.#closeListener = listener
  }

  /** A conexão com a sala caiu. */
  close(code = 1006): void {
    this.#closeListener(code)
  }

  leave(): Promise<void> {
    return Promise.resolve()
  }

  drop(): Promise<void> {
    return Promise.resolve()
  }
}
