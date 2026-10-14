import {
  dequantizePositionM,
  type KillEvent,
  type MeleeWeapon,
  type Vector3,
  type WireInput,
} from '@shobu/core'
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

export interface NetworkPort {
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
  /** O `sessionId` deste jogador na sala, ou `undefined` sem sala. */
  readonly ownId: string | undefined
  /**
   * A lâmina da classe: vai para a sala agora, ou assim que ela chegar. O
   * servidor anda o corpo com ela, e lâmina diferente é predição corrigida.
   */
  chooseMelee(weapon: MeleeWeapon): void
}

/**
 * ```ts
 * const network = createNetworkPort()
 * openGameLink(url, address, delayMs).then((link) => network.attach(link))
 * ```
 */
export function createNetworkPort(): NetworkPort {
  const slot = createLinkSlot()
  return {
    sendTickInput: (input) => slot.link?.sendTickInput(input),
    forEachRemote: (nowMs, visit) => slot.link?.forEachRemote(nowMs, visit),
    attach: (next) => attachLink(slot, next),
    chooseMelee: (weapon) => chooseMelee(slot, weapon),
    drainKills: (visit) => drain(slot.kills, visit),
    drainBoundaryDeaths: (visit) => drain(slot.boundaryDeaths, visit),
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
  readonly kills: KillEvent[]
  readonly boundaryDeaths: string[]
}

function createLinkSlot(): LinkSlot {
  return { link: undefined, ownWasAlive: false, melee: undefined, kills: [], boundaryDeaths: [] }
}

function chooseMelee(slot: LinkSlot, weapon: MeleeWeapon): void {
  slot.melee = weapon
  slot.link?.sendLoadout(weapon)
}

/** A sala nova: o que ela avisar fora do quadro fica guardado, e a classe vai para ela. */
function attachLink(slot: LinkSlot, next: GameLink): void {
  slot.link = next
  slot.ownWasAlive = false
  next.onKill((kill) => slot.kills.push({ ...kill }))
  next.onBoundaryDeath((playerId) => slot.boundaryDeaths.push(playerId))
  if (slot.melee) next.sendLoadout(slot.melee)
}

function drain<Event>(events: Event[], visit: (event: Event) => void): void {
  for (const event of events) visit(event)
  events.length = 0
}

/** A confirmação é lida a cada quadro, então o objeto devolvido é sempre o mesmo. */
function readConfirmation(slot: LinkSlot): () => OwnConfirmation | undefined {
  const scratch: { ackSeq: number; own: PlayerSnapshotFields } = {
    ackSeq: 0,
    own: { x: 0, y: 0, z: 0, aimX: 0, aimY: 0, aimZ: -32767, stance: 0, alive: true },
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
