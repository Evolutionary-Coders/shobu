import { Client, type Room } from '@colyseus/sdk'
import { Predict } from '@colyseus/sdk/predict'
import type { WireInput } from '@shobu/core'
import type { MutableWireInput } from './encodeTickInput.ts'
import type { PlayerSnapshotFields } from './remotePlayerView.ts'

/**
 * O canal de jogo, do lado do cliente: a interface do projeto sobre o
 * `@colyseus/sdk`. Adapter de rede; quem decide alguma coisa com o que chega
 * daqui está em `remotePlayerView.ts` e no controller.
 */
export interface GameLink {
  readonly sessionId: string
  /** O input de um tick, na ordem em que a predição o usou. */
  sendTickInput(input: WireInput): void
  /** Avança a interpolação até `nowMs` e visita cada outro jogador com o valor interpolado. */
  forEachRemote(
    nowMs: number,
    visit: (playerId: string, fields: PlayerSnapshotFields) => void,
  ): void
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
    sendTickInput: createInputSender(room),
    forEachRemote: createRemoteReader(room, interpolationDelayMs),
    leave: async () => {
      await room.leave()
    },
  }
}

/** Copia campo a campo no mesmo objeto do sdk: nada é alocado por tick. */
function createInputSender(room: Room): GameLink['sendTickInput'] {
  const input = room.input()
  const data = input.data as MutableWireInput
  return (wire) => {
    data.wishX = wire.wishX
    data.wishZ = wire.wishZ
    data.buttons = wire.buttons
    data.aimX = wire.aimX
    data.aimY = wire.aimY
    data.aimZ = wire.aimZ
    input.send()
  }
}

/**
 * O `Predict` da 0.18 interpola cada jogador no relógio do servidor, com o
 * atraso do buffer de interpolação. A postura não se interpola: é um byte de
 * estado, e o meio do caminho entre "em pé" e "no slide" não existe.
 */
function createRemoteReader(room: Room, delayMs: number): GameLink['forEachRemote'] {
  const predict = Predict.get(room, { mode: 'lerp', delay: delayMs })
  predict.attachAll('players', { fields: [...INTERPOLATED_FIELDS] })
  // o cliente não importa o schema do servidor: o estado chega descrito no
  // handshake, e é só aqui que ele ganha o formato de `gameRoomState.ts`.
  const players = (): Map<string, PlayerSnapshotFields> => room.state.players
  const scratch = { x: 0, y: 0, z: 0, aimX: 0, aimY: 0, aimZ: 0, stance: 0 }
  return (nowMs, visit) => {
    predict.tick(nowMs)
    for (const [playerId, player] of players()) {
      if (playerId === room.sessionId) continue
      for (const field of INTERPOLATED_FIELDS) scratch[field] = predict.value(player, field)
      scratch.stance = player.stance
      visit(playerId, scratch)
    }
  }
}
