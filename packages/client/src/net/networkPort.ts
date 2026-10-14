import {
  dequantizePositionM,
  type KillEvent,
  type MeleeWeapon,
  type ShotMessage,
  type Vector3,
  type WireInput,
} from '@shobu/core'
import type { LatencySource } from '../instrumentation/latencySource.ts'
import type { GameLink } from './gameLink.ts'
import type { PlayerSnapshotFields } from './remotePlayerView.ts'

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
  /** O nome de perfil, com o mesmo contrato da lâmina: agora, ou quando a sala chegar. */
  chooseCallsign(callsign: string): void
}

/**
 * ```ts
 * const network = createNetworkPort()
 * openGameLink(url, { address, arenaId }, delayMs).then((link) => network.attach(link))
 * ```
 */
export function createNetworkPort(): NetworkPort {
  const slot = createLinkSlot()
  return {
    sendTickInput: (input) => slot.link?.sendTickInput(input),
    forEachRemote: (nowMs, visit) => slot.link?.forEachRemote(nowMs, visit),
    attach: (next) => attachLink(slot, next),
    chooseMelee: (weapon) => chooseMelee(slot, weapon),
    chooseCallsign: (callsign) => chooseCallsign(slot, callsign),
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
  /** O último nome, pelo mesmo motivo. */
  callsign: string | undefined
  readonly kills: KillEvent[]
  readonly boundaryDeaths: string[]
  readonly shots: ShotMessage[]
}

function createLinkSlot(): LinkSlot {
  return {
    link: undefined,
    ownWasAlive: false,
    melee: undefined,
    callsign: undefined,
    kills: [],
    boundaryDeaths: [],
    shots: [],
  }
}

function chooseMelee(slot: LinkSlot, weapon: MeleeWeapon): void {
  slot.melee = weapon
  slot.link?.sendLoadout(weapon)
}

function chooseCallsign(slot: LinkSlot, callsign: string): void {
  slot.callsign = callsign
  slot.link?.sendCallsign(callsign)
}

/** A sala nova: o que ela avisar fora do quadro fica guardado, e a classe e o nome vão para ela. */
function attachLink(slot: LinkSlot, next: GameLink): void {
  slot.link = next
  slot.ownWasAlive = false
  next.onKill((kill) => slot.kills.push({ ...kill }))
  next.onBoundaryDeath((playerId) => slot.boundaryDeaths.push(playerId))
  // a mensagem já chega como objeto novo, decodificado: guardar não precisa de cópia.
  next.onShot((shot) => slot.shots.push(shot))
  if (slot.melee) next.sendLoadout(slot.melee)
  if (slot.callsign !== undefined) next.sendCallsign(slot.callsign)
}

function drain<Event>(events: Event[], visit: (event: Event) => void): void {
  for (const event of events) visit(event)
  events.length = 0
}

/** A confirmação é lida a cada quadro, então o objeto devolvido é sempre o mesmo. */
function readConfirmation(slot: LinkSlot): () => OwnConfirmation | undefined {
  const scratch: { ackSeq: number; own: PlayerSnapshotFields } = {
    ackSeq: 0,
    own: { x: 0, y: 0, z: 0, aimX: 0, aimY: 0, aimZ: -32767, stance: 0, alive: true, name: '' },
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
