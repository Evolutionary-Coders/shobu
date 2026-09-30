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
  createRoomDirectory,
  enqueueWaiter,
  forgetWaiter,
  planEntry,
  type RoomDirectory,
  registerRoom,
  takeNextWaiter,
  unregisterRoom,
} from './roomDirectory.ts'

/** O nome do tipo de sala no `defineServer`. */
export const ROOM_NAME = 'arena'

/** O que a sala avisa ao matchmaking sobre a própria vida. */
export interface RoomLifecycle {
  roomCreated(address: string, roomId: string): void
  roomDisposed(address: string): void
  playerLeft(address: string, sessionId: string, code: number | undefined): void
}

export interface Matchmaking extends RoomLifecycle {
  /** A rota `ROOM_ENTRY_PATH`, para o `createRouter` do `defineServer`. */
  readonly enterEndpoint: ReturnType<typeof createEndpoint>
}

type ISeatReservation = Awaited<ReturnType<typeof matchMaker.reserveSeatFor>>
type Offer = SeatOffer<ISeatReservation>

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
 * const matchmaking = createMatchmaking()
 * defineServer({ rooms: { arena: defineRoom(createGameRoom({ ..., lifecycle: matchmaking })) },
 *   routes: createRouter({ enter: matchmaking.enterEndpoint }) })
 * ```
 */
export function createMatchmaking(): Matchmaking {
  const directory = createRoomDirectory()
  const serial = createSerialQueue()
  return {
    enterEndpoint: createEndpoint(ROOM_ENTRY_PATH, { method: 'POST' }, async (ctx) => {
      const address = addressOf(ctx.body)
      if (!address)
        throw ctx.error(400, {
          error: `endereço ${JSON.stringify(ctx.body)} inválido; esperado { address: '203.0.113.7' }`,
        })
      const offer = await serial.run(() => enter(directory, address))
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
        await callNextWaiter(directory, address)
      })
    },
  }
}

function addressOf(body: unknown): string | undefined {
  const text = (body as { address?: unknown } | undefined)?.address
  return typeof text === 'string' ? parseRoomAddress(text) : undefined
}

async function enter(directory: RoomDirectory, address: string): Promise<Offer> {
  const plan = planEntry(directory, address, (candidate) => hasVacancy(directory, candidate))
  if (plan.kind === 'create') return { reservation: await createAndReserve(address), address }
  if (plan.kind === 'join') return { reservation: await reserveIn(directory, address), address }
  const provisional = plan.provisional ?? freeAddress(directory)
  const reservation = plan.provisional
    ? await reserveIn(directory, provisional)
    : await createAndReserve(provisional)
  enqueueWaiter(directory, address, {
    sessionId: reservation.sessionId,
    roomId: reservation.roomId,
  })
  return { reservation, address: provisional }
}

/**
 * Chama o primeiro da fila que ainda está no jogo, com o assento já reservado
 * na sala pedida. Quem saiu enquanto esperava é pulado.
 */
async function callNextWaiter(directory: RoomDirectory, address: string): Promise<void> {
  while (hasVacancy(directory, address)) {
    const waiter = takeNextWaiter(directory, address)
    if (!waiter) return
    const room = matchMaker.getLocalRoomById(waiter.roomId)
    const client = room?.clients.getById(waiter.sessionId)
    if (!client) continue
    const offer: Offer = { reservation: await reserveIn(directory, address), address }
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

async function createAndReserve(address: string): Promise<ISeatReservation> {
  const room = await matchMaker.createRoom(ROOM_NAME, { address })
  return matchMaker.reserveSeatFor(room, { address })
}

async function reserveIn(directory: RoomDirectory, address: string): Promise<ISeatReservation> {
  const roomId = directory.rooms.get(address)
  if (roomId === undefined)
    throw new Error(`sem sala no endereço '${address}'; esperado sala aberta`)
  return matchMaker.reserveSeatFor(await matchMaker.getRoomById(roomId), { address })
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
