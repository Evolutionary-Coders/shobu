import {
  type CosmeticLoadoutMessage,
  decodeMatchPhase,
  dequantizePositionM,
  isIdleWireInput,
  type MatchSummaryRow,
  type MeleeWeapon,
  type PrimaryWeapon,
  type RoomKillMessage,
  type ScorestreakActivatedMessage,
  type ScorestreakEarnedMessage,
  type ScorestreakSlug,
  type ShotMessage,
  type Vector3,
  type WireAim,
  type WireInput,
} from '@shobu/core'
import type { LatencySource } from '../instrumentation/latencySource.ts'
import type { GameLink } from './gameLink.ts'
import { createKickVoteRelay, type KickVotePort } from './kickVotePort.ts'
import { pingReportDue } from './pingReport.ts'
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

export interface NetworkPort extends LatencySource, KickVotePort {
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
  /**
   * A partida seguinte da sala pôs todo mundo num spawn, vivo ou não: o
   * próximo `takeOwnSpawn` devolve onde o jogador está.
   */
  restartOwnSpawn(): void
  /** O que a reconciliação precisa, ou `undefined` sem sala ou antes do primeiro estado. */
  confirmation(): OwnConfirmation | undefined
  /**
   * Visita as kills da sala desde a última chamada, uma vez cada, na ordem do
   * servidor. A mensagem chega fora do quadro; a sessão as lê no seguinte.
   */
  drainKills(visit: (kill: RoomKillMessage) => void): void
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
  /**
   * A skin e o acabamento da sniper, com o mesmo contrato da lâmina: os outros
   * os leem no estado da sala e vestem este jogador igual em toda tela.
   */
  chooseCosmetics(look: CosmeticLoadoutMessage): void
  /** O último visual escolhido, ou `undefined` sem nenhum: vai no pedido de entrada. */
  chosenCosmetics(): CosmeticLoadoutMessage | undefined
  /**
   * O jogador pegou (`true`) ou soltou o controle da arena. Pegar avisa a
   * sala agora e cada sala que chegar enquanto ele durar: é o que põe em jogo
   * a vaga que voltou da recarga no mapa novo (ADR 0031), e o clique pode vir
   * antes de a reconexão terminar.
   */
  announceControl(inControl: boolean): void
  /**
   * O último nome escolhido (`chooseCallsign`), ou `undefined` sem nenhum: vai
   * no pedido de entrada, e a sala nomeia a vaga já no `onJoin`.
   */
  chosenCallsign(): string | undefined
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
  /**
   * Os segundos até a sala tirar este jogador por inatividade, contados aqui
   * desde o aviso, ou `undefined` sem aviso. O primeiro input que mexe em
   * alguma coisa (`isIdleWireInput`) o apaga, como apaga a conta da sala.
   */
  afkSecondsLeft(): number | undefined
  /**
   * Cada vez que a sala fecha, com o código do fechamento: `AFK_CLOSE_CODE`
   * é a saída por inatividade, que o menu explica.
   */
  onRoomClosed(listener: (code: number | undefined) => void): void
}

/**
 * ```ts
 * const network = createNetworkPort()
 * requestSeat(url, { address, arenaId }, delayMs).then((seat) => seat.take()).then((link) => network.attach(link))
 * ```
 */
export function createNetworkPort(nowS: () => number = wallClockS): NetworkPort {
  const slot = createLinkSlot()
  const kick = createKickVoteRelay(() => slot.link)
  return {
    ...linkPortOf(slot, nowS, kick.listen),
    ...kick.port,
    ...idlePortOf(slot, nowS),
    ...profilePortOf(slot),
    ...scorestreakPortOf(slot),
    ...matchPortOf(slot),
    ...eventPortOf(slot),
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
    ...spawnPortOf(slot),
    get connected() {
      return slot.link !== undefined
    },
  }
}

/** As mortes e os tiros que a sala avisou fora do quadro. */
function eventPortOf(
  slot: LinkSlot,
): Pick<NetworkPort, 'drainKills' | 'drainBoundaryDeaths' | 'drainShots'> {
  return {
    drainKills: (visit) => drain(slot.kills, visit),
    drainBoundaryDeaths: (visit) => drain(slot.boundaryDeaths, visit),
    drainShots: (visit) => drain(slot.shots, visit),
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
  /** O último visual, pelo mesmo motivo. */
  cosmetics: CosmeticLoadoutMessage | undefined
  /** Se o jogador está com o controle da arena, para a sala que chegar com ele já fora do menu. */
  inControl: boolean
  /** As últimas séries escolhidas, pelo mesmo motivo. */
  scorestreaks: readonly ScorestreakSlug[] | undefined
  readonly kills: RoomKillMessage[]
  readonly boundaryDeaths: string[]
  readonly shots: ShotMessage[]
  readonly scorestreaksEarned: ScorestreakEarnedMessage[]
  readonly scorestreaksActivated: ScorestreakActivatedMessage[]
  readonly summaries: (readonly MatchSummaryRow[])[]
  /** Quando o rtt foi à sala pela última vez (`pingReportDue`). */
  pingSentS: number
  /** A mira do último input enviado: é contra ela que o próximo diz se mexeu. */
  sentAim: WireAim
  /** Quando a sala tira este jogador, se o aviso de inatividade estiver de pé. */
  afkDeadlineS: number | undefined
  readonly closeListeners: ((code: number | undefined) => void)[]
}

function createLinkSlot(): LinkSlot {
  return {
    link: undefined,
    ownWasAlive: false,
    pingSentS: Number.NEGATIVE_INFINITY,
    sentAim: { aimX: 0, aimY: 0, aimZ: 0 },
    afkDeadlineS: undefined,
    closeListeners: [],
    melee: undefined,
    primary: undefined,
    callsign: undefined,
    cosmetics: undefined,
    inControl: false,
    scorestreaks: undefined,
    kills: [],
    boundaryDeaths: [],
    shots: [],
    scorestreaksEarned: [],
    scorestreaksActivated: [],
    summaries: [],
  }
}

/**
 * O pedaço do que o jogador diz de si: a classe, o nome e se está no
 * controle, guardados para a sala que chegar.
 */
function profilePortOf(
  slot: LinkSlot,
): Pick<
  NetworkPort,
  | 'chooseMelee'
  | 'choosePrimary'
  | 'chooseCallsign'
  | 'chosenCallsign'
  | 'chooseCosmetics'
  | 'chosenCosmetics'
  | 'announceControl'
> {
  return {
    chooseMelee: (weapon) => chooseMelee(slot, weapon),
    choosePrimary: (weapon) => choosePrimary(slot, weapon),
    chooseCallsign: (callsign) => chooseCallsign(slot, callsign),
    chosenCallsign: () => slot.callsign,
    chooseCosmetics: (look) => chooseCosmetics(slot, look),
    chosenCosmetics: () => slot.cosmetics,
    announceControl: (inControl) => announceControl(slot, inControl),
  }
}

function announceControl(slot: LinkSlot, inControl: boolean): void {
  slot.inControl = inControl
  if (inControl) slot.link?.sendInControl()
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

function chooseCosmetics(slot: LinkSlot, look: CosmeticLoadoutMessage): void {
  slot.cosmetics = look
  slot.link?.sendCosmetics(look)
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
 * e arma principal), o visual, o nome e as séries vão para ela. A sala que
 * fecha solta o lugar: sem isto, o jogo seguia "conectado" a uma sala morta,
 * com os outros congelados e sem bots locais.
 */
function attachLink(slot: LinkSlot, next: GameLink, nowS: () => number): void {
  slot.link = next
  slot.ownWasAlive = false
  slot.pingSentS = Number.NEGATIVE_INFINITY
  slot.afkDeadlineS = undefined
  next.onClose((code) => {
    if (slot.link !== next) return
    slot.link = undefined
    for (const listener of slot.closeListeners) listener(code)
  })
  next.onAfkWarning((secondsLeft) => {
    slot.afkDeadlineS = nowS() + secondsLeft
  })
  next.onKill((kill) => slot.kills.push({ ...kill }))
  next.onBoundaryDeath((playerId) => slot.boundaryDeaths.push(playerId))
  // a mensagem já chega como objeto novo, decodificado: guardar não precisa de cópia.
  next.onShot((shot) => slot.shots.push(shot))
  listenScorestreaks(slot, next)
  next.onMatchSummary((rows) => slot.summaries.push(rows))
  resendProfile(slot, next)
}

/** O que o jogador já disse de si, de novo para a sala nova: ela começa sem saber nada. */
function resendProfile(slot: LinkSlot, next: GameLink): void {
  if (slot.melee) next.sendLoadout(slot.melee)
  if (slot.primary) next.sendPrimary(slot.primary)
  if (slot.callsign !== undefined) next.sendCallsign(slot.callsign)
  if (slot.cosmetics) next.sendCosmetics(slot.cosmetics)
  if (slot.scorestreaks) next.sendScorestreaks(slot.scorestreaks)
  if (slot.inControl) next.sendInControl()
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

/** O spawn deste jogador: na volta da morte, e de novo quando a partida seguinte começa. */
function spawnPortOf(slot: LinkSlot): Pick<NetworkPort, 'takeOwnSpawn' | 'restartOwnSpawn'> {
  return {
    takeOwnSpawn: () => takeSpawn(slot),
    restartOwnSpawn: () => {
      slot.ownWasAlive = false
    },
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

/** A sala nova, e o que vai e vem dela a cada tick: o input e os outros jogadores. */
function linkPortOf(
  slot: LinkSlot,
  nowS: () => number,
  listenKickVotes: (next: GameLink) => void,
): Pick<NetworkPort, 'sendTickInput' | 'forEachRemote' | 'attach'> {
  return {
    sendTickInput: tickSender(slot, nowS),
    forEachRemote: (nowMs, visit) => slot.link?.forEachRemote(nowMs, visit),
    attach: (next) => {
      attachLink(slot, next, nowS)
      listenKickVotes(next)
    },
  }
}

/** O input do tick vai à sala, e o rtt vai junto quando é hora (`reportPing`). */
function tickSender(slot: LinkSlot, nowS: () => number): NetworkPort['sendTickInput'] {
  return (input) => {
    reportPing(slot, nowS())
    noteActivity(slot, input)
    return slot.link?.sendTickInput(input)
  }
}

/**
 * O rtt vai à sala de tempos em tempos, junto com o input do tick, que é o
 * único relógio que a porta vê. Sem amostra ainda (zero), espera: mandar zero
 * pintaria um ping perfeito na coluna dos outros.
 */
function reportPing(slot: LinkSlot, nowS: number): void {
  const rttMs = slot.link?.rttMs() ?? 0
  if (rttMs <= 0 || !pingReportDue(slot.pingSentS, nowS)) return
  slot.pingSentS = nowS
  slot.link?.sendPing(rttMs)
}

/** O relógio do navegador, em segundos: o padrão fora dos testes. */
function wallClockS(): number {
  return performance.now() / 1000
}

/** O input que mexe em alguma coisa apaga o aviso de inatividade, como na sala. */
function noteActivity(slot: LinkSlot, input: Readonly<WireInput>): void {
  if (!isIdleWireInput(slot.sentAim, input)) slot.afkDeadlineS = undefined
  slot.sentAim = { aimX: input.aimX, aimY: input.aimY, aimZ: input.aimZ }
}

/**
 * A sala só conta a inatividade em `live`, e perdoa todo mundo na entrada da
 * partida seguinte (`forgiveIdleSeats`). Fora dela o aviso não vale mais — e,
 * com a arena congelada, nenhum input o apagaria, e ele ficaria por cima do
 * pódio e do voto. Sem a fase no estado, vale como `live` (`decodeMatchPhase`).
 */
function dropAfkOutsideLive(slot: LinkSlot): void {
  if (decodeMatchPhase(slot.link?.matchState()?.phase) !== 'live') slot.afkDeadlineS = undefined
}

/** O aviso de inatividade e o fechamento da sala, para o hud e para o menu. */
function idlePortOf(
  slot: LinkSlot,
  nowS: () => number,
): Pick<NetworkPort, 'afkSecondsLeft' | 'onRoomClosed'> {
  return {
    afkSecondsLeft: () => {
      dropAfkOutsideLive(slot)
      if (!slot.link || slot.afkDeadlineS === undefined) return undefined
      return Math.max(0, slot.afkDeadlineS - nowS())
    },
    onRoomClosed: (listener) => {
      slot.closeListeners.push(listener)
    },
  }
}
