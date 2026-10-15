import { Client, type Room } from '@colyseus/sdk'
import { Predict } from '@colyseus/sdk/predict'
import {
  BOUNDARY_DEATH_MESSAGE,
  type BoundaryDeathMessage,
  CALLSIGN_MESSAGE,
  type CallsignMessage,
  KILL_MESSAGE,
  type KillEvent,
  LOADOUT_MESSAGE,
  type LoadoutMessage,
  type MeleeWeapon,
  ROOM_ENTRY_PATH,
  ROOM_MOVE_MESSAGE,
  type SeatOffer,
  SHOT_MESSAGE,
  type ShotMessage,
  VOICE_TICKET_MESSAGE,
  type VoiceTicket,
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
  /** O mapa da sala: é nele que o servidor simula. */
  readonly arenaId: string
  /** O input de um tick, na ordem em que a predição o usou. Devolve o número de sequência dele. */
  sendTickInput(input: WireInput): number
  /** O último número de sequência que o servidor confirmou ter aplicado (`input.lastProcessed`). */
  lastProcessed(): number
  /** O ida e volta suavizado do relógio da sala, em ms; 0 antes da primeira amostra. */
  rttMs(): number
  /** Avança a interpolação até `nowMs` e visita cada outro jogador com o valor interpolado. */
  forEachRemote(
    nowMs: number,
    visit: (playerId: string, fields: PlayerSnapshotFields) => void,
  ): void
  /** O snapshot do próprio jogador, cru, ou `undefined` antes do primeiro estado. */
  ownSnapshot(): PlayerSnapshotFields | undefined
  /** Cada kill da sala, de qualquer um, na ordem do servidor. */
  onKill(listener: (kill: KillEvent) => void): void
  /** Cada morte por sair da área de jogo. */
  onBoundaryDeath(listener: (playerId: string) => void): void
  /** Cada tiro da sala, de qualquer um, inclusive o deste jogador. */
  onShot(listener: (shot: ShotMessage) => void): void
  /** A lâmina da classe que o jogador escolheu: o servidor anda o corpo com ela. */
  sendLoadout(meleeWeapon: MeleeWeapon): void
  /** O nome de perfil: os outros clientes o leem no estado da sala. */
  sendCallsign(callsign: string): void
  /**
   * A vaga abriu na sala pedida. `follow` sai desta sala e entra na pedida,
   * com o assento que o servidor já reservou.
   */
  onMove(listener: (follow: () => Promise<GameLink>) => void): void
  /** O token da sala de voz. Sem servidor de mídia, nunca chama. */
  onVoiceTicket(listener: (ticket: VoiceTicket) => void): void
  /**
   * A sala acabou para este link, uma vez só: a conexão caiu, o servidor fechou,
   * ou o jogador saiu (`leave`, `follow`). Chama já na saída, sem esperar o
   * fechamento, para nada mais sair por uma conexão que está fechando.
   */
  onClose(listener: () => void): void
  leave(): Promise<void>
}

type SeatReservation = Parameters<Client['consumeSeatReservation']>[0]

/**
 * O pedido de entrada: o endereço da sala e o mapa que a cena subiu. Uma sala
 * nova nasce nesse mapa; numa que já existe, vale o dela (`SeatOffer.arenaId`).
 */
export interface RoomRequest {
  readonly address: string
  readonly arenaId: string
}

const INTERPOLATED_FIELDS = ['x', 'y', 'z', 'aimX', 'aimY', 'aimZ'] as const

/**
 * Pede a entrada pelo endereço na rota de matchmaking do servidor de jogo e
 * entra na sala que ele reservou: a do endereço, ou uma provisória, com a sala
 * pedida cheia. Sem reconexão: o sdk vem com ela ligada, e a sala não guarda a
 * vaga de quem cai (docs/rede, "Reconexão").
 *
 * ```ts
 * const link = await openGameLink(gameServerUrl(location, 2567), { address, arenaId }, interpolationDelayMs(config))
 * ```
 */
export async function openGameLink(
  serverUrl: string,
  request: RoomRequest,
  interpolationDelayMs: number,
): Promise<GameLink> {
  const client = new Client(serverUrl)
  const { data } = await client.http.post(ROOM_ENTRY_PATH, { body: { ...request } })
  return takeSeat(client, data as SeatOffer<SeatReservation>, interpolationDelayMs)
}

async function takeSeat(
  client: Client,
  offer: SeatOffer<SeatReservation>,
  interpolationDelayMs: number,
): Promise<GameLink> {
  const room: Room = await client.consumeSeatReservation(offer.reservation)
  room.reconnection.enabled = false
  const { leave, onClose } = createLeaveChannel(room)
  return {
    sessionId: room.sessionId,
    address: offer.address,
    arenaId: offer.arenaId,
    ...createInputChannel(room, interpolationDelayMs),
    forEachRemote: createRemoteReader(room, interpolationDelayMs),
    ownSnapshot: () => playersOf(room.state).get(room.sessionId),
    rttMs: () => room.clock.smoothedRtt(),
    onVoiceTicket: createVoiceTicketChannel(room),
    ...createEventChannel(room),
    ...createProfileChannel(room),
    onMove: createMoveChannel(leave, room, client, interpolationDelayMs),
    onClose,
    leave,
  }
}

/** A saída da sala, pedida ou não, avisada uma vez. */
function createLeaveChannel(room: Room): Pick<GameLink, 'leave' | 'onClose'> {
  const close = createCloseSignal()
  // sem reconexão, sair da sala é silencioso: o jogo segue sozinho. o log com
  // o código é o que diz se a sala caiu, e por quê.
  room.onLeave((code, reason) => {
    console.warn(JSON.stringify({ event: 'room.left', code, reason }))
    close.fire()
  })
  return {
    leave: async () => {
      close.fire()
      await room.leave()
    },
    onClose: close.listen,
  }
}

/** O fim da sala, avisado uma vez a cada ouvinte, venha de onde vier. */
function createCloseSignal(): { fire(): void; listen(listener: () => void): void } {
  const listeners: (() => void)[] = []
  let closed = false
  return {
    fire: () => {
      if (closed) return
      closed = true
      for (const listener of listeners) listener()
    },
    listen: (listener) => {
      if (closed) listener()
      else listeners.push(listener)
    },
  }
}

/** A chamada da fila: sair desta sala e ocupar o assento já reservado na pedida. */
function createMoveChannel(
  leave: () => Promise<void>,
  room: Room,
  client: Client,
  interpolationDelayMs: number,
): GameLink['onMove'] {
  return (listener) => {
    room.onMessage(ROOM_MOVE_MESSAGE, (next: SeatOffer<SeatReservation>) =>
      listener(async () => {
        await leave()
        return takeSeat(client, next, interpolationDelayMs)
      }),
    )
  }
}

/** O que o jogador diz de si à sala: a lâmina da classe e o nome de perfil. */
function createProfileChannel(room: Room): Pick<GameLink, 'sendLoadout' | 'sendCallsign'> {
  return {
    sendLoadout: (meleeWeapon) =>
      room.send(LOADOUT_MESSAGE, { meleeWeapon } satisfies LoadoutMessage),
    sendCallsign: (callsign) => room.send(CALLSIGN_MESSAGE, { callsign } satisfies CallsignMessage),
  }
}

/** As mortes da sala, de tiro, de lâmina e fora da área, e os tiros, na ordem do servidor. */
function createEventChannel(room: Room): Pick<GameLink, 'onKill' | 'onBoundaryDeath' | 'onShot'> {
  return {
    onShot: (listener) => {
      room.onMessage(SHOT_MESSAGE, listener)
    },
    onKill: (listener) => {
      room.onMessage(KILL_MESSAGE, listener)
    },
    onBoundaryDeath: (listener) => {
      room.onMessage(BOUNDARY_DEATH_MESSAGE, (death: BoundaryDeathMessage) =>
        listener(death.playerId),
      )
    },
  }
}

/**
 * O servidor manda o token logo depois da entrada, e ele pode chegar antes de
 * alguém escutar: o sdk descarta mensagem sem ouvinte, então o canal guarda o
 * token até ser pedido.
 */
function createVoiceTicketChannel(room: Room): GameLink['onVoiceTicket'] {
  let received: VoiceTicket | undefined
  let listening: ((ticket: VoiceTicket) => void) | undefined
  room.onMessage(VOICE_TICKET_MESSAGE, (ticket: VoiceTicket) => {
    received = ticket
    listening?.(ticket)
  })
  return (listener) => {
    listening = listener
    if (received) listener(received)
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
 * o tiro contra posições um buffer inteiro mais novas que as da tela.
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
  const scratch = { x: 0, y: 0, z: 0, aimX: 0, aimY: 0, aimZ: 0, stance: 0, alive: true, name: '' }
  return (nowMs, visit) => {
    predict.tick(nowMs)
    for (const [playerId, player] of playersOf(room.state)) {
      if (playerId === room.sessionId) continue
      for (const field of INTERPOLATED_FIELDS) scratch[field] = predict.value(player, field)
      scratch.stance = player.stance
      scratch.alive = player.alive
      scratch.name = player.name
      visit(playerId, scratch)
    }
  }
}
