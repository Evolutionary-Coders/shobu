import { randomInt } from 'node:crypto'
import { createEndpoint, matchMaker } from '@colyseus/core'
import {
  type EntryLook,
  entryCallsignOf,
  entryDeviceKeyOf,
  entryLookOf,
  parseRoomEntryRequest,
  ROOM_ENTRY_PATH,
  ROOM_MOVE_MESSAGE,
  type RoomVisibility,
  SEAT_RESERVATION_S,
} from '@shobu/core'
import type { RoomStanding } from './quickMatch.ts'
import {
  arenaAt,
  arenaWanted,
  createRoomArenas,
  moveRoomArena,
  type RoomArenas,
} from './roomArenas.ts'
import {
  admitSeat,
  banDevice,
  createRoomDirectory,
  expectRoom,
  expireSeat,
  forgetWaiter,
  freeAddress,
  isBanned,
  issueSeat,
  type RoomDirectory,
  registerRoom,
  roomVisibilityOf,
  seatJoined,
  settleExpectedRoom,
  takeReachableWaiter,
  unregisterRoom,
  type Waiter,
} from './roomDirectory.ts'
import { offerAt, routeRoomEntry, type SeatSource } from './roomEntryRoute.ts'
import { createSerialQueue, type SerialQueue } from './serialQueue.ts'

/**
 * O nome do tipo de sala no `defineServer`: um só para todo mapa. Antes era um
 * por mapa, cada um nascendo com a colisão e os bots do seu; com o voto no
 * servidor (ADR 0031), a sala troca de mapa no meio da vida, e o mapa da
 * criação vai nas opções (`arenaId`).
 */
export const GAME_ROOM_NAME = 'arena'

/** O que a sala avisa ao matchmaking sobre a própria vida. */
export interface RoomLifecycle {
  /** A sala nasceu; `standing` lê a situação dela na hora de cada partida rápida. */
  roomCreated(address: string, roomId: string, standing: () => RoomStanding): void
  roomDisposed(address: string): void
  playerLeft(address: string, sessionId: string, code: number | undefined): void
  /** Se o assento foi reservado pelo matchmaking: é o `onAuth` da sala. */
  admits(sessionId: string): boolean
  /** O assento aceito sentou: é o `onJoin` da sala. */
  seated(sessionId: string): void
  /** O voto trocou o mapa da sala: quem entrar depois recebe o novo. */
  arenaChanged(address: string, arenaId: string): void
  /** Se a sala registrada é pública ou privada: decide entre voto e anfitrião (ADR 0034). */
  visibilityOf(address: string): RoomVisibility
  /** O voto tirou este aparelho da sala: ele não volta ao endereço até o banimento vencer. */
  playerKicked(address: string, deviceKey: string): void
}

export interface Matchmaking extends RoomLifecycle {
  /** A rota `ROOM_ENTRY_PATH`, para o `createRouter` do `defineServer`. */
  readonly enterEndpoint: ReturnType<typeof createEndpoint>
}

type ISeatReservation = Awaited<ReturnType<typeof matchMaker.reserveSeatFor>>

/** O diretório e a fila única que serializa quem mexe nele. */
interface MatchmakingParts {
  readonly directory: RoomDirectory
  readonly serial: SerialQueue
  readonly arenas: RoomArenas
  /** Como ler a situação de cada sala aberta, para a partida rápida. */
  readonly standings: Map<string, () => RoomStanding>
  readonly bans: KickBanClock
}

/**
 * Quanto dura o banimento da sala e o relógio que o mede, injetado para o
 * banimento ser testável sem esperar dez minutos.
 */
export interface KickBanClock {
  readonly kickBanS: number
  nowMs(): number
}

/**
 * O matchmaking pela URL e a partida rápida, ligados ao colyseus. Adapter: a
 * decisão de onde cada um joga está em `roomDirectory.ts`, o caminho de cada
 * pedido de entrada em `roomEntryRoute.ts`, a ordem das salas da partida
 * rápida em `quickMatch.ts`, e o mapa de cada sala em `roomArenas.ts`.
 *
 * Entrada e chamada da fila passam uma de cada vez. Reservar assento é
 * assíncrono, e sem a fila única uma entrada nova veria a vaga de quem foi
 * chamado antes de a reserva dele contar, e a tomaria.
 * ponytail: uma fila para o servidor inteiro; por endereço, se a entrada virar
 * gargalo.
 *
 * ```ts
 * const matchmaking = createMatchmaking(NEON_KAIDO_LAYOUT.id, [NEON_KAIDO_LAYOUT.id, ICHIBAN_GAI_LAYOUT.id],
 *   { kickBanS: 600, nowMs: () => Date.now() })
 * defineServer({ rooms: { [GAME_ROOM_NAME]: defineRoom(createGameRoom({ ..., lifecycle: matchmaking })) },
 *   routes: createRouter({ enter: matchmaking.enterEndpoint }) })
 * ```
 */
export function createMatchmaking(
  defaultArenaId: string,
  catalogIds: readonly string[],
  bans: KickBanClock,
): Matchmaking {
  const directory = createRoomDirectory()
  const serial = createSerialQueue()
  const arenas = createRoomArenas(defaultArenaId, catalogIds)
  const standings = new Map<string, () => RoomStanding>()
  const parts: MatchmakingParts = { directory, serial, arenas, standings, bans }
  return { enterEndpoint: createEnterEndpoint(parts), ...roomLifecycleOf(parts) }
}

/** O que a sala avisa, aplicado ao diretório, aos mapas e às situações das salas. */
function roomLifecycleOf(parts: MatchmakingParts): RoomLifecycle {
  const { directory, serial, arenas, standings } = parts
  return {
    roomCreated: (address, roomId, standing) => {
      registerRoom(directory, address, roomId)
      standings.set(address, standing)
    },
    roomDisposed: (address) => {
      // sem esta linha, a sala vazia sumia do log calada, e a seguinte no
      // mesmo endereço parecia um `room.created` duplicado.
      console.log(JSON.stringify({ event: 'room.disposed', address }))
      unregisterRoom(directory, address)
      arenas.byAddress.delete(address)
      standings.delete(address)
    },
    playerLeft: (address, sessionId, code) => {
      // o código de fechamento diz quem fechou e por quê: 1000/4000 é saída
      // limpa, 1006 é queda sem aviso (o heartbeat derrubou).
      console.log(JSON.stringify({ event: 'room.left', address, sessionId, code }))
      void serial.run(async () => {
        forgetWaiter(directory, sessionId)
        await callNextWaiter(parts, address)
      })
    },
    admits: (sessionId) => admitSeat(directory, sessionId),
    seated: (sessionId) => seatJoined(directory, sessionId),
    arenaChanged: (address, arenaId) => moveRoomArena(arenas, address, arenaId),
    ...kickLifecycleOf(parts),
  }
}

/** O que o voto de expulsão pergunta e avisa (ADR 0034): a visibilidade e o banimento. */
function kickLifecycleOf(
  parts: MatchmakingParts,
): Pick<RoomLifecycle, 'visibilityOf' | 'playerKicked'> {
  const { directory, bans } = parts
  return {
    visibilityOf: (address) => roomVisibilityOf(directory, address),
    playerKicked: (address, deviceKey) => {
      banDevice(directory, address, deviceKey, bans.nowMs() + bans.kickBanS * 1000)
    },
  }
}

/**
 * `POST /rooms/enter`: o corpo é um `RoomEntryRequest` (endereço, partida
 * rápida ou sala nova) com o mapa que o cliente subiu.
 */
function createEnterEndpoint(parts: MatchmakingParts): Matchmaking['enterEndpoint'] {
  return createEndpoint(ROOM_ENTRY_PATH, { method: 'POST' }, async (ctx) => {
    const request = parseRoomEntryRequest(ctx.body)
    if (!request)
      throw ctx.error(400, {
        error: `pedido de entrada ${JSON.stringify(ctx.body)} inválido; esperado { kind: 'address', address: '203.0.113.7' }, { kind: 'quick' } ou { kind: 'create', visibility: 'public' | 'private' }, com arenaId`,
      })
    const wanted = arenaWanted(parts.arenas, request)
    const joiner = {
      callsign: entryCallsignOf(ctx.body),
      ...entryLookOf(ctx.body),
      deviceKey: entryDeviceKeyOf(ctx.body),
    }
    const source = seatSourceOf(parts, joiner)
    return Response.json(
      await parts.serial.run(() => routeRoomEntry(parts.directory, source, request, wanted)),
    )
  })
}

/**
 * O caminho da entrada (`roomEntryRoute.ts`) ligado ao colyseus: reservar,
 * criar e ler as vagas são deste adapter; decidir onde cada um joga, não.
 */
function seatSourceOf(
  parts: MatchmakingParts,
  joiner: SeatJoiner = {},
): SeatSource<ISeatReservation> {
  const { directory, arenas, standings, bans } = parts
  const deviceKey = joiner.deviceKey ?? ''
  return {
    reserveIn: (address) => reserveIn(parts, address, joiner),
    createAndReserve: (address, arenaId, visibility) =>
      createAndReserve(parts, { address, arenaId, visibility }, joiner),
    drawFreeAddress: () => drawFreeAddress(directory),
    hasVacancy: (address) => hasVacancy(directory, address),
    standingOf: (address) => standings.get(address)?.(),
    registeredArenaOf: (address) => arenaAt(arenas, address),
    isBanned: (address) => isBanned(directory, address, deviceKey, bans.nowMs()),
    deviceKey,
    log: (event) => console.log(JSON.stringify(event)),
  }
}

function drawFreeAddress(directory: RoomDirectory): string {
  return freeAddress(directory, () => randomInt(0, 2 ** 32))
}

/**
 * Chama o primeiro da fila que ainda está no jogo, com o assento já reservado
 * na sala pedida. Quem saiu enquanto esperava é pulado.
 */
async function callNextWaiter(parts: MatchmakingParts, address: string): Promise<void> {
  const { directory } = parts
  if (!hasVacancy(directory, address)) return
  const waiter = takeReachableWaiter(directory, address, (queued) => clientOf(queued) !== undefined)
  const client = waiter && clientOf(waiter)
  if (!waiter || !client) return
  const joiner = { deviceKey: waiter.deviceKey ?? '' }
  const offer = offerAt(seatSourceOf(parts), address, await reserveIn(parts, address, joiner))
  client.send(ROOM_MOVE_MESSAGE, offer)
  console.log(JSON.stringify({ event: 'room.queue-called', address, sessionId: waiter.sessionId }))
}

/** A conexão de quem espera, na sala provisória dele; `undefined` se ele já saiu. */
function clientOf(waiter: Waiter) {
  return matchMaker.getLocalRoomById(waiter.roomId)?.clients.getById(waiter.sessionId)
}

/** A vaga conta os assentos reservados: é o que impede duas entradas na mesma vaga. */
function hasVacancy(directory: RoomDirectory, address: string): boolean {
  const roomId = directory.rooms.get(address)
  const room = roomId === undefined ? undefined : matchMaker.getLocalRoomById(roomId)
  return room !== undefined && !room.hasReachedMaxClients()
}

/**
 * O que quem entra diz de si no pedido, e vai nas opções do assento até o
 * `onJoin` (`GameRoomJoinOptions`). A chamada da fila não tem pedido: quem
 * espera já está nomeado na sala provisória, e o nome e o visual chegam por
 * mensagem.
 */
interface SeatJoiner extends EntryLook {
  readonly callsign?: string
  /** A chave do aparelho (`entryDeviceKeyOf`): o banimento da sala a reconhece. */
  readonly deviceKey?: string
}

async function createAndReserve(
  parts: MatchmakingParts,
  {
    address,
    arenaId,
    visibility,
  }: { address: string; arenaId: string; visibility: RoomVisibility },
  joiner: SeatJoiner,
): Promise<ISeatReservation> {
  expectRoom(parts.directory, address, visibility)
  parts.arenas.byAddress.set(address, arenaId)
  try {
    const room = await matchMaker.createRoom(GAME_ROOM_NAME, { address, arenaId })
    console.log(JSON.stringify({ event: 'room.created', address, visibility, arenaId }))
    return issue(parts, address, await matchMaker.reserveSeatFor(room, { address, ...joiner }))
  } finally {
    // a sala se registra no `onCreate`, e uma criação que falhou não deixa o
    // endereço aberto para a rota padrão.
    settleExpectedRoom(parts.directory, address)
  }
}

async function reserveIn(
  parts: MatchmakingParts,
  address: string,
  joiner: SeatJoiner = {},
): Promise<ISeatReservation> {
  const roomId = parts.directory.rooms.get(address)
  if (roomId === undefined)
    throw new Error(`sem sala no endereço '${address}'; esperado sala aberta`)
  const room = await matchMaker.getRoomById(roomId)
  return issue(parts, address, await matchMaker.reserveSeatFor(room, { address, ...joiner }))
}

/**
 * O assento passa a valer no `onAuth`. Quando a reserva vence, a vaga dela
 * volta sem passar por `onLeave`: o colyseus não avisa, então a fila é
 * conferida de novo nesse instante, e quem foi chamado e não veio não segura
 * a vaga de quem espera atrás dele.
 */
function issue(
  parts: MatchmakingParts,
  address: string,
  reservation: ISeatReservation,
): ISeatReservation {
  issueSeat(parts.directory, reservation.sessionId, address)
  setTimeout(() => {
    expireSeat(parts.directory, reservation.sessionId)
    void parts.serial.run(() => callNextWaiter(parts, address))
  }, SEAT_RESERVATION_S * 1000).unref()
  return reservation
}
