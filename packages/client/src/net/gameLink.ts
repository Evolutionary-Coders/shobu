import { Client, type Room } from '@colyseus/sdk'
import { Predict } from '@colyseus/sdk/predict'
import {
  KILL_MESSAGE,
  type KillMessage,
  ROOM_ENTRY_PATH,
  ROOM_MOVE_MESSAGE,
  type SeatOffer,
  type WireInput,
} from '@shobu/core'
import type { MutableWireInput } from './encodeTickInput.ts'
import { type PlayerSnapshotFields, playersOf } from './remotePlayerView.ts'

/**
 * O canal de jogo, do lado do cliente: a interface do projeto sobre o
 * `@colyseus/sdk`. Adapter de rede; quem decide alguma coisa com o que chega
 * daqui está em `remotePlayerView.ts` e no controller.
 */
export interface GameLink {
  readonly sessionId: string
  /** O endereço da sala em que se joga; na fila, é o da sala provisória. */
  readonly address: string
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
  /**
   * A vaga abriu na sala pedida. `follow` sai desta sala e entra na pedida,
   * com o assento que o servidor já reservou.
   */
  onMove(listener: (follow: () => Promise<GameLink>) => void): void
  leave(): Promise<void>
}

type SeatReservation = Parameters<Client['consumeSeatReservation']>[0]

const INTERPOLATED_FIELDS = ['x', 'y', 'z', 'aimX', 'aimY', 'aimZ'] as const

/**
 * Pede a entrada pelo endereço na rota de matchmaking do servidor de jogo e
 * entra na sala que ele reservou: a do endereço, ou uma provisória, com a sala
 * pedida cheia. Sem reconexão: o sdk vem com ela ligada, e a sala não guarda a
 * vaga de quem cai (docs/rede, "Reconexão").
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
  const client = new Client(serverUrl)
  const { data } = await client.http.post(ROOM_ENTRY_PATH, { body: { address } })
  return takeSeat(client, data as SeatOffer<SeatReservation>, interpolationDelayMs)
}

async function takeSeat(
  client: Client,
  offer: SeatOffer<SeatReservation>,
  interpolationDelayMs: number,
): Promise<GameLink> {
  const room: Room = await client.consumeSeatReservation(offer.reservation)
  room.reconnection.enabled = false
  // sem reconexão, sair da sala é silencioso: o jogo segue sozinho. o log com
  // o código é o que diz se a sala caiu, e por quê.
  room.onLeave((code, reason) => console.warn(JSON.stringify({ event: 'room.left', code, reason })))
  return {
    sessionId: room.sessionId,
    address: offer.address,
    ...createInputChannel(room, interpolationDelayMs),
    forEachRemote: createRemoteReader(room, interpolationDelayMs),
    ownSnapshot: () => playersOf(room.state).get(room.sessionId),
    onKill: (listener) => {
      room.onMessage(KILL_MESSAGE, listener)
    },
    onMove: (listener) => {
      room.onMessage(ROOM_MOVE_MESSAGE, (next: SeatOffer<SeatReservation>) =>
        listener(async () => {
          await room.leave()
          return takeSeat(client, next, interpolationDelayMs)
        }),
      )
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
