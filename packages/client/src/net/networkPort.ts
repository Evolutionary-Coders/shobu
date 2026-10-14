import { dequantizePositionM, type KillEvent, type Vector3, type WireInput } from '@shobu/core'
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
   * O spawn que o servidor escolheu, uma vez só, assim que o primeiro estado do
   * próprio jogador chega. `undefined` antes disso e depois de entregue.
   */
  takeOwnSpawn(): Vector3 | undefined
  /** O que a reconciliação precisa, ou `undefined` sem sala ou antes do primeiro estado. */
  confirmation(): OwnConfirmation | undefined
  /**
   * Visita as kills confirmadas desde a última chamada, uma vez cada. A
   * mensagem chega fora do quadro; o render as lê no quadro seguinte.
   */
  drainKills(visit: (kill: KillEvent) => void): void
}

/**
 * ```ts
 * const network = createNetworkPort()
 * openGameLink(url, address, delayMs).then((link) => network.attach(link))
 * ```
 */
export function createNetworkPort(): NetworkPort {
  const slot: LinkSlot = { link: undefined, spawnPending: false, kills: [] }
  return {
    sendTickInput: (input) => slot.link?.sendTickInput(input),
    forEachRemote: (nowMs, visit) => slot.link?.forEachRemote(nowMs, visit),
    attach: (next) => {
      slot.link = next
      slot.spawnPending = true
      next.onKill((kill) => slot.kills.push(kill))
    },
    drainKills: (visit) => {
      for (const kill of slot.kills) visit(kill)
      slot.kills.length = 0
    },
    confirmation: readConfirmation(slot),
    takeOwnSpawn: () => takeSpawn(slot),
    get connected() {
      return slot.link !== undefined
    },
  }
}

/** A sala, quando chegar, e se o spawn dela ainda não foi entregue. */
interface LinkSlot {
  link: GameLink | undefined
  spawnPending: boolean
  readonly kills: KillEvent[]
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

function takeSpawn(slot: LinkSlot): Vector3 | undefined {
  const own = slot.spawnPending ? slot.link?.ownSnapshot() : undefined
  if (!own) return undefined
  slot.spawnPending = false
  return {
    x: dequantizePositionM(own.x),
    y: dequantizePositionM(own.y),
    z: dequantizePositionM(own.z),
  }
}
