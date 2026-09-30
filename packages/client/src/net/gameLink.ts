import { Client, type Room } from '@colyseus/sdk'
import { Predict } from '@colyseus/sdk/predict'
import { KILL_MESSAGE, type KillMessage, type WireInput } from '@shobu/core'
import type { MutableWireInput } from './encodeTickInput.ts'
import { type PlayerSnapshotFields, playersOf } from './remotePlayerView.ts'

/**
 * O canal de jogo, do lado do cliente: a interface do projeto sobre o
 * `@colyseus/sdk`. Adapter de rede; quem decide alguma coisa com o que chega
 * daqui está em `remotePlayerView.ts` e no controller.
 */
export interface GameLink {
  readonly sessionId: string
  /** O input de um tick, na ordem em que a predição o usou. Devolve o número de sequência dele. */
  sendTickInput(input: WireInput): number
  /** O último número de sequência que o servidor confirmou ter aplicado (`input.lastProcessed`). */
  lastProcessed(): number
  /** Avança a interpolação até `nowMs` e visita cada outro jogador com o valor interpolado. */
  forEachRemote(
    nowMs: number,
    visit: (playerId: string, fields: PlayerSnapshotFields) => void,
  ): void
  /** O snapshot do próprio jogador, cru, ou `undefined` antes do primeiro estado. */
  ownSnapshot(): PlayerSnapshotFields | undefined
  /** Cada kill que o servidor confirmou para este jogador. */
  onKill(listener: (kill: KillMessage) => void): void
  leave(): Promise<void>
}

const INTERPOLATED_FIELDS = ['x', 'y', 'z', 'aimX', 'aimY', 'aimZ'] as const

/**
 * Entra na sala do endereço. Sem reconexão: o sdk vem com ela ligada, e a sala
 * não guarda a vaga de quem cai (docs/rede, "Reconexão").
 *
 * ```ts
 * const link = await openGameLink(gameServerUrl(location, 2567), address, interpolationDelayMs(config))
 * ```
 */
export async function openGameLink(
  serverUrl: string,
  address: string,
  interpolationDelayMs: number,
): Promise<GameLink> {
  const room = await new Client(serverUrl).joinOrCreate('arena', { address })
  room.reconnection.enabled = false
  return {
    sessionId: room.sessionId,
    ...createInputChannel(room, interpolationDelayMs),
    forEachRemote: createRemoteReader(room, interpolationDelayMs),
    ownSnapshot: () => playersOf(room.state).get(room.sessionId),
    onKill: (listener) => {
      room.onMessage(KILL_MESSAGE, listener)
    },
    leave: async () => {
      await room.leave()
    },
  }
}

/**
 * O canal de input confiável do sdk. Copia campo a campo no mesmo objeto, sem
 * alocar por tick; o `sentCount` depois do envio é o número de sequência que o
 * servidor confirma de volta em `lastProcessed`.
 *
 * O `renderDelay` é o atraso de interpolação do `Predict`: o sdk carimba cada
 * input com o instante do servidor que a tela mostrava, e o rewind do servidor
 * rebobina até ele. Sem ele o carimbo sai sem o buffer, e o servidor validaria
 * o tiro contra posições 46,9 ms mais novas que as da tela.
 */
function createInputChannel(
  room: Room,
  renderDelayMs: number,
): Pick<GameLink, 'sendTickInput' | 'lastProcessed'> {
  const input = room.input({ renderDelay: renderDelayMs })
  const data = input.data as MutableWireInput
  return {
    sendTickInput: (wire) => {
      data.wishX = wire.wishX
      data.wishZ = wire.wishZ
      data.buttons = wire.buttons
      data.aimX = wire.aimX
      data.aimY = wire.aimY
      data.aimZ = wire.aimZ
      input.send()
      return input.sentCount
    },
    lastProcessed: () => input.lastProcessed,
  }
}

/**
 * O `Predict` da 0.18 interpola cada jogador no relógio do servidor, com o
 * atraso do buffer de interpolação. A postura e o `alive` não se interpolam:
 * são estado discreto, e o meio do caminho entre "em pé" e "no slide" não existe.
 */
function createRemoteReader(room: Room, delayMs: number): GameLink['forEachRemote'] {
  const predict = Predict.get(room, { mode: 'lerp', delay: delayMs })
  predict.attachAll('players', { fields: [...INTERPOLATED_FIELDS] })
  const scratch = { x: 0, y: 0, z: 0, aimX: 0, aimY: 0, aimZ: 0, stance: 0, alive: true }
  return (nowMs, visit) => {
    predict.tick(nowMs)
    for (const [playerId, player] of playersOf(room.state)) {
      if (playerId === room.sessionId) continue
      for (const field of INTERPOLATED_FIELDS) scratch[field] = predict.value(player, field)
      scratch.stance = player.stance
      scratch.alive = player.alive
      visit(playerId, scratch)
    }
  }
}
