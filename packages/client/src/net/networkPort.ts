import { dequantizePositionM, type Vector3, type WireInput } from '@shobu/core'
import type { GameLink } from './gameLink.ts'
import type { PlayerSnapshotFields } from './remotePlayerView.ts'

/**
 * O que o renderer usa da rede. A cena começa antes da conexão, porque entrar
 * na sala é assíncrono e o pilar 2 não espera por ela: até o `attach`, o jogo
 * roda sozinho, e depois os mesmos métodos passam a falar com a sala.
 */
export interface NetworkPort {
  sendTickInput(input: WireInput): void
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
}

/**
 * ```ts
 * const network = createNetworkPort()
 * openGameLink(url, address, delayMs).then((link) => network.attach(link))
 * ```
 */
export function createNetworkPort(): NetworkPort {
  let link: GameLink | undefined
  let spawnPending = false
  return {
    sendTickInput: (input) => link?.sendTickInput(input),
    forEachRemote: (nowMs, visit) => link?.forEachRemote(nowMs, visit),
    attach: (next) => {
      link = next
      spawnPending = true
    },
    takeOwnSpawn: () => {
      const own = spawnPending ? link?.ownSnapshot() : undefined
      if (!own) return undefined
      spawnPending = false
      return {
        x: dequantizePositionM(own.x),
        y: dequantizePositionM(own.y),
        z: dequantizePositionM(own.z),
      }
    },
    get connected() {
      return link !== undefined
    },
  }
}
