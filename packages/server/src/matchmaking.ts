import { randomInt } from 'node:crypto'
import { createEndpoint, matchMaker } from '@colyseus/core'
import {
  generateRoomAddress,
  parseRoomAddress,
  ROOM_ENTRY_PATH,
  ROOM_MOVE_MESSAGE,
  type SeatOffer,
} from '@shobu/core'
import {
  admitSeat,
  createRoomDirectory,
  enqueueWaiter,
  expectRoom,
  forgetWaiter,
  issueSeat,
  planEntry,
  type RoomDirectory,
  registerRoom,
  takeNextWaiter,
  unregisterRoom,
} from './roomDirectory.ts'

/** O nome do tipo de sala no `defineServer`. */
export const ROOM_NAME = 'arena'

/**
 * Quanto um assento reservado espera o jogador chegar, o padrão do colyseus,
 * fixado aqui porque o matchmaking confere a fila de novo quando ele vence.
 */
export const SEAT_RESERVATION_S = 15

/** O que a sala avisa ao matchmaking sobre a própria vida. */
export interface RoomLifecycle {
  roomCreated(address: string, roomId: string): void
  roomDisposed(address: string): void
  playerLeft(address: string, sessionId: string, code: number | undefined): void
  /** Se o assento foi reservado pelo matchmaking: é o `onAuth` da sala. */
  admits(sessionId: string): boolean
}

export interface Matchmaking extends RoomLifecycle {
  /** A rota `ROOM_ENTRY_PATH`, para o `createRouter` do `defineServer`. */
  readonly enterEndpoint: ReturnType<typeof createEndpoint>
}

type ISeatReservation = Awaited<ReturnType<typeof matchMaker.reserveSeatFor>>
type Offer = SeatOffer<ISeatReservation>
type SerialQueue = ReturnType<typeof createSerialQueue>

/** O diretório e a fila única que serializa quem mexe nele. */
interface MatchmakingParts {
  readonly directory: RoomDirectory
  readonly serial: SerialQueue
  /** O mapa de toda sala. ponytail: um mapa para o servidor inteiro, até o voto (ADR 0022). */
  readonly arenaId: string
}

/**
 * O matchmaking pela URL, ligado ao colyseus. Adapter: a decisão de onde cada
 * um joga está em `roomDirectory.ts`.
 *
 * Entrada e chamada da fila passam uma de cada vez. Reservar assento é
 * assíncrono, e sem a fila única uma entrada nova veria a vaga de quem foi
 * chamado antes de a reserva dele contar, e a tomaria.
 * ponytail: uma fila para o servidor inteiro; por endereço, se a entrada virar
 * gargalo.
 *
 * ```ts
 * const matchmaking = createMatchmaking(NEON_KAIDO_LAYOUT.id)
 * defineServer({ rooms: { arena: defineRoom(createGameRoom({ ..., lifecycle: matchmaking })) },
 *   routes: createRouter({ enter: matchmaking.enterEndpoint }) })
 * ```
 */
export function createMatchmaking(arenaId: string): Matchmaking {
  const directory = createRoomDirectory()
  const serial = createSerialQueue()
  const parts: MatchmakingParts = { directory, serial, arenaId }
  return {
    enterEndpoint: createEndpoint(ROOM_ENTRY_PATH, { method: 'POST' }, async (ctx) => {
      const address = addressOf(ctx.body)
      if (!address)
        throw ctx.error(400, {
          error: `endereço ${JSON.stringify(ctx.body)} inválido; esperado { address: '203.0.113.7' }`,
        })
      const offer = await serial.run(() => enter(parts, address))
      return Response.json(offer)
    }),
    roomCreated: (address, roomId) => registerRoom(directory, address, roomId),
    roomDisposed: (address) => unregisterRoom(directory, address),
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
  }
}

function addressOf(body: unknown): string | undefined {
  const text = (body as { address?: unknown } | undefined)?.address
  return typeof text === 'string' ? parseRoomAddress(text) : undefined
}

async function enter(parts: MatchmakingParts, address: string): Promise<Offer> {
  const { directory, arenaId } = parts
  const plan = planEntry(directory, address, (candidate) => hasVacancy(directory, candidate))
  if (plan.kind === 'create')
    return { reservation: await createAndReserve(parts, address), address, arenaId }
  if (plan.kind === 'join')
    return { reservation: await reserveIn(parts, address), address, arenaId }
  const provisional = plan.provisional ?? freeAddress(directory)
  const reservation = plan.provisional
    ? await reserveIn(parts, provisional)
    : await createAndReserve(parts, provisional)
  enqueueWaiter(directory, address, {
    sessionId: reservation.sessionId,
    roomId: reservation.roomId,
  })
  return { reservation, address: provisional, arenaId }
}

/**
 * Chama o primeiro da fila que ainda está no jogo, com o assento já reservado
 * na sala pedida. Quem saiu enquanto esperava é pulado.
 */
async function callNextWaiter(parts: MatchmakingParts, address: string): Promise<void> {
  const { directory } = parts
  while (hasVacancy(directory, address)) {
    const waiter = takeNextWaiter(directory, address)
    if (!waiter) return
    const room = matchMaker.getLocalRoomById(waiter.roomId)
    const client = room?.clients.getById(waiter.sessionId)
    if (!client) continue
    const offer: Offer = {
      reservation: await reserveIn(parts, address),
      address,
      arenaId: parts.arenaId,
    }
    client.send(ROOM_MOVE_MESSAGE, offer)
    console.log(
      JSON.stringify({ event: 'room.queue-called', address, sessionId: waiter.sessionId }),
    )
    return
  }
}

/** A vaga conta os assentos reservados: é o que impede duas entradas na mesma vaga. */
function hasVacancy(directory: RoomDirectory, address: string): boolean {
  const roomId = directory.rooms.get(address)
  const room = roomId === undefined ? undefined : matchMaker.getLocalRoomById(roomId)
  return room !== undefined && !room.hasReachedMaxClients()
}

async function createAndReserve(
  parts: MatchmakingParts,
  address: string,
): Promise<ISeatReservation> {
  expectRoom(parts.directory, address)
  try {
    const room = await matchMaker.createRoom(ROOM_NAME, { address })
    return issue(parts, address, await matchMaker.reserveSeatFor(room, { address }))
  } finally {
    // a sala se registra no `onCreate`, e uma criação que falhou não deixa o
    // endereço aberto para a rota padrão.
    parts.directory.expectedRooms.delete(address)
  }
}

async function reserveIn(parts: MatchmakingParts, address: string): Promise<ISeatReservation> {
  const roomId = parts.directory.rooms.get(address)
  if (roomId === undefined)
    throw new Error(`sem sala no endereço '${address}'; esperado sala aberta`)
  const room = await matchMaker.getRoomById(roomId)
  return issue(parts, address, await matchMaker.reserveSeatFor(room, { address }))
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
  issueSeat(parts.directory, reservation.sessionId)
  setTimeout(() => {
    parts.directory.issuedSeats.delete(reservation.sessionId)
    void parts.serial.run(() => callNextWaiter(parts, address))
  }, SEAT_RESERVATION_S * 1000).unref()
  return reservation
}

function freeAddress(directory: RoomDirectory): string {
  for (;;) {
    const address = generateRoomAddress(() => randomInt(0, 2 ** 32))
    if (!directory.rooms.has(address)) return address
  }
}

/** Promessas encadeadas: cada tarefa começa quando a anterior termina, com erro ou não. */
function createSerialQueue(): { run<T>(task: () => Promise<T>): Promise<T> } {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    run: (task) => {
      const next = tail.then(task)
      tail = next.catch(() => undefined)
      return next
    },
  }
}
