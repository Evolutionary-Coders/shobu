import {
  dequantizePositionM,
  type KillEvent,
  type MatchSummaryRow,
  type MeleeWeapon,
  type PrimaryWeapon,
  type ScorestreakActivatedMessage,
  type ScorestreakEarnedMessage,
  type ScorestreakSlug,
  type ShotMessage,
  type Vector3,
  type WireInput,
} from '@shobu/core'
import type { LatencySource } from '../instrumentation/latencySource.ts'
import type { GameLink } from './gameLink.ts'
import { createPlayerSnapshotFields, type PlayerSnapshotFields } from './remotePlayerView.ts'
import {
  createRoomMatchView,
  type OfficialScoreFields,
  type RoomMatchView,
  readRoomMatch,
} from './roomMatchView.ts'

/**
 * O que o renderer usa da rede. A cena começa antes da conexão, porque entrar
 * na sala é assíncrono e o pilar 2 não espera por ela: até o `attach`, o jogo
 * roda sozinho, e depois os mesmos métodos passam a falar com a sala.
 */
/** A confirmação do servidor: o último input aplicado e a posição que ele produziu. */
export interface OwnConfirmation {
  readonly ackSeq: number
  readonly own: PlayerSnapshotFields
}

export interface NetworkPort extends LatencySource {
  /** Devolve o número de sequência do input, ou `undefined` sem sala. */
  sendTickInput(input: WireInput): number | undefined
  forEachRemote(
    nowMs: number,
    visit: (playerId: string, fields: PlayerSnapshotFields) => void,
  ): void
  attach(link: GameLink): void
  readonly connected: boolean
  /**
   * Onde o servidor pôs este jogador para nascer: no primeiro estado e a cada
   * volta da morte, uma vez cada. `undefined` fora desses instantes.
   */
  takeOwnSpawn(): Vector3 | undefined
  /** O que a reconciliação precisa, ou `undefined` sem sala ou antes do primeiro estado. */
  confirmation(): OwnConfirmation | undefined
  /**
   * Visita as kills da sala desde a última chamada, uma vez cada, na ordem do
   * servidor. A mensagem chega fora do quadro; a sessão as lê no seguinte.
   */
  drainKills(visit: (kill: KillEvent) => void): void
  /** As mortes por sair da área de jogo, com o mesmo contrato do `drainKills`. */
  drainBoundaryDeaths(visit: (playerId: string) => void): void
  /** Os tiros da sala, com o mesmo contrato do `drainKills`. */
  drainShots(visit: (shot: ShotMessage) => void): void
  /** O `sessionId` deste jogador na sala, ou `undefined` sem sala. */
  readonly ownId: string | undefined
  /**
   * A lâmina da classe: vai para a sala agora, ou assim que ela chegar. O
   * servidor anda o corpo com ela, e lâmina diferente é predição corrigida.
   */
  chooseMelee(weapon: MeleeWeapon): void
  /** A arma principal, com o mesmo contrato da lâmina: os outros a leem no estado da sala. */
  choosePrimary(weapon: PrimaryWeapon): void
  /** O nome de perfil, com o mesmo contrato da lâmina: agora, ou quando a sala chegar. */
  chooseCallsign(callsign: string): void
  /** As séries de pontuação da escolha, com o mesmo contrato da lâmina. */
  chooseScorestreaks(scorestreaks: readonly ScorestreakSlug[]): void
  /** Pede à sala a série do slot. Sem sala, o pedido se perde: não há quem decida. */
  requestScorestreak(slot: number): void
  /** As séries que a sala diz que este jogador ganhou, com o contrato do `drainKills`. */
  drainScorestreakEarned(visit: (earned: ScorestreakEarnedMessage) => void): void
  /** As séries acionadas na sala, de qualquer um, com o contrato do `drainKills`. */
  drainScorestreakActivated(visit: (activated: ScorestreakActivatedMessage) => void): void
  /**
   * A partida da sala, já lida (ADR 0031), ou `undefined` sem sala ou antes do
   * primeiro estado. **Reaproveitada**: vale até a próxima chamada.
   */
  matchState(): Readonly<RoomMatchView> | undefined
  /** Os votos à vista na sala, de quem votou para o índice da opção. */
  forEachBallot(visit: (voterId: string, optionIndex: number) => void): void
  /** O placar oficial de cada jogador da sala, pelo id da sala. */
  forEachOfficialScore(visit: (playerId: string, score: OfficialScoreFields) => void): void
  /** O resumo da partida que acabou, com o contrato do `drainKills`. */
  drainMatchSummary(visit: (rows: readonly MatchSummaryRow[]) => void): void
  /** O voto do jogador no próximo mapa. Sem sala, se perde: não há quem conte. */
  castMapVote(optionIndex: number): void
}

/**
 * ```ts
 * const network = createNetworkPort()
 * requestSeat(url, { address, arenaId }, delayMs).then((seat) => seat.take()).then((link) => network.attach(link))
 * ```
 */
export function createNetworkPort(): NetworkPort {
  const slot = createLinkSlot()
  return {
    sendTickInput: (input) => slot.link?.sendTickInput(input),
    forEachRemote: (nowMs, visit) => slot.link?.forEachRemote(nowMs, visit),
    attach: (next) => attachLink(slot, next),
    ...profilePortOf(slot),
    ...scorestreakPortOf(slot),
    ...matchPortOf(slot),
    drainKills: (visit) => drain(slot.kills, visit),
    drainBoundaryDeaths: (visit) => drain(slot.boundaryDeaths, visit),
    drainShots: (visit) => drain(slot.shots, visit),
    // o relógio da sala amostra o ida e volta pela confirmação do input: zero é
    // "ainda sem amostra", que a tela mostra como `PING --`.
    latencyMs: () => {
      const rtt = slot.link?.rttMs() ?? 0
      return rtt > 0 ? rtt : null
    },
    get ownId() {
      return slot.link?.sessionId
    },
    confirmation: readConfirmation(slot),
    takeOwnSpawn: () => takeSpawn(slot),
    get connected() {
      return slot.link !== undefined
    },
  }
}

/** A sala, quando chegar, o que chegou dela fora do quadro, e se o jogador estava vivo. */
interface LinkSlot {
  link: GameLink | undefined
  ownWasAlive: boolean
  /** A última lâmina escolhida, para a sala que chegar depois da escolha. */
  melee: MeleeWeapon | undefined
  /** A última arma principal escolhida, pelo mesmo motivo. */
  primary: PrimaryWeapon | undefined
  /** O último nome, pelo mesmo motivo. */
  callsign: string | undefined
  /** As últimas séries escolhidas, pelo mesmo motivo. */
  scorestreaks: readonly ScorestreakSlug[] | undefined
  readonly kills: KillEvent[]
  readonly boundaryDeaths: string[]
  readonly shots: ShotMessage[]
  readonly scorestreaksEarned: ScorestreakEarnedMessage[]
  readonly scorestreaksActivated: ScorestreakActivatedMessage[]
  readonly summaries: (readonly MatchSummaryRow[])[]
}

function createLinkSlot(): LinkSlot {
  return {
    link: undefined,
    ownWasAlive: false,
    melee: undefined,
    primary: undefined,
    callsign: undefined,
    scorestreaks: undefined,
    kills: [],
    boundaryDeaths: [],
    shots: [],
    scorestreaksEarned: [],
    scorestreaksActivated: [],
    summaries: [],
  }
}

/** O pedaço do que o jogador diz de si: a classe e o nome, guardados para a sala que chegar. */
function profilePortOf(
  slot: LinkSlot,
): Pick<NetworkPort, 'chooseMelee' | 'choosePrimary' | 'chooseCallsign'> {
  return {
    chooseMelee: (weapon) => chooseMelee(slot, weapon),
    choosePrimary: (weapon) => choosePrimary(slot, weapon),
    chooseCallsign: (callsign) => chooseCallsign(slot, callsign),
  }
}

function chooseMelee(slot: LinkSlot, weapon: MeleeWeapon): void {
  slot.melee = weapon
  slot.link?.sendLoadout(weapon)
}

function choosePrimary(slot: LinkSlot, weapon: PrimaryWeapon): void {
  slot.primary = weapon
  slot.link?.sendPrimary(weapon)
}

function chooseCallsign(slot: LinkSlot, callsign: string): void {
  slot.callsign = callsign
  slot.link?.sendCallsign(callsign)
}

/** O pedaço das séries de pontuação: a escolha, o aperto e o que a sala avisou. */
function scorestreakPortOf(
  slot: LinkSlot,
): Pick<
  NetworkPort,
  | 'chooseScorestreaks'
  | 'requestScorestreak'
  | 'drainScorestreakEarned'
  | 'drainScorestreakActivated'
> {
  return {
    chooseScorestreaks: (scorestreaks) => chooseScorestreaks(slot, scorestreaks),
    requestScorestreak: (index) => slot.link?.sendScorestreakActivation(index),
    drainScorestreakEarned: (visit) => drain(slot.scorestreaksEarned, visit),
    drainScorestreakActivated: (visit) => drain(slot.scorestreaksActivated, visit),
  }
}

/** O pedaço da partida da sala (ADR 0031): a fase, o placar oficial, o voto e o resumo. */
function matchPortOf(
  slot: LinkSlot,
): Pick<
  NetworkPort,
  'matchState' | 'forEachBallot' | 'forEachOfficialScore' | 'drainMatchSummary' | 'castMapVote'
> {
  const view = createRoomMatchView()
  return {
    matchState: () => {
      const fields = slot.link?.matchState()
      return fields && readRoomMatch(fields, view)
    },
    forEachBallot: (visit) => {
      const ballots = slot.link?.matchState()?.ballots
      if (ballots) for (const [voterId, index] of ballots) visit(voterId, index)
    },
    forEachOfficialScore: (visit) => slot.link?.forEachScore(visit),
    drainMatchSummary: (visit) => drain(slot.summaries, visit),
    castMapVote: (optionIndex) => slot.link?.sendMapVote(optionIndex),
  }
}

function chooseScorestreaks(slot: LinkSlot, scorestreaks: readonly ScorestreakSlug[]): void {
  slot.scorestreaks = scorestreaks
  slot.link?.sendScorestreaks(scorestreaks)
}

/**
 * A sala nova: o que ela avisar fora do quadro fica guardado, e a classe (lâmina
 * e arma principal), o nome e as séries vão para ela. A sala que fecha solta o lugar: sem isto, o jogo seguia
 * "conectado" a uma sala morta, com os outros congelados e sem bots locais.
 */
function attachLink(slot: LinkSlot, next: GameLink): void {
  slot.link = next
  slot.ownWasAlive = false
  next.onClose(() => {
    if (slot.link === next) slot.link = undefined
  })
  next.onKill((kill) => slot.kills.push({ ...kill }))
  next.onBoundaryDeath((playerId) => slot.boundaryDeaths.push(playerId))
  // a mensagem já chega como objeto novo, decodificado: guardar não precisa de cópia.
  next.onShot((shot) => slot.shots.push(shot))
  listenScorestreaks(slot, next)
  next.onMatchSummary((rows) => slot.summaries.push(rows))
  if (slot.melee) next.sendLoadout(slot.melee)
  if (slot.primary) next.sendPrimary(slot.primary)
  if (slot.callsign !== undefined) next.sendCallsign(slot.callsign)
  if (slot.scorestreaks) next.sendScorestreaks(slot.scorestreaks)
}

/** O que a sala avisa das séries fica guardado até o quadro seguinte, como as kills. */
function listenScorestreaks(slot: LinkSlot, next: GameLink): void {
  next.onScorestreakEarned((earned) => slot.scorestreaksEarned.push(earned))
  next.onScorestreakActivated((activated) => slot.scorestreaksActivated.push(activated))
}

function drain<Event>(events: Event[], visit: (event: Event) => void): void {
  for (const event of events) visit(event)
  events.length = 0
}

/** A confirmação é lida a cada quadro, então o objeto devolvido é sempre o mesmo. */
function readConfirmation(slot: LinkSlot): () => OwnConfirmation | undefined {
  const scratch: { ackSeq: number; own: PlayerSnapshotFields } = {
    ackSeq: 0,
    own: createPlayerSnapshotFields(),
  }
  return () => {
    const own = slot.link?.ownSnapshot()
    if (!slot.link || !own) return undefined
    scratch.ackSeq = slot.link.lastProcessed()
    scratch.own = own
    return scratch
  }
}

/** O spawn é o estado em que o jogador passa de morto (ou de ausente) a vivo. */
function takeSpawn(slot: LinkSlot): Vector3 | undefined {
  const own = slot.link?.ownSnapshot()
  if (!own) return undefined
  const born = own.alive && !slot.ownWasAlive
  slot.ownWasAlive = own.alive
  if (!born) return undefined
  return {
    x: dequantizePositionM(own.x),
    y: dequantizePositionM(own.y),
    z: dequantizePositionM(own.z),
  }
}
