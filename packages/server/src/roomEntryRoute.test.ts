import type { RoomVisibility } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import type { RoomStanding } from './quickMatch.ts'
import {
  createRoomDirectory,
  enqueueWaiter,
  expectRoom,
  type RoomDirectory,
  registerRoom,
} from './roomDirectory.ts'
import { offerAt, type ReservedSeatRef, routeRoomEntry, type SeatSource } from './roomEntryRoute.ts'

const NEON = 'neon-kaido'
const ICHIBAN = 'ichiban-gai'
const FREE = '192.0.2.1'

interface FakeReservation extends ReservedSeatRef {
  readonly address: string
}

/**
 * As salas do colyseus, de mentira: cada sala aberta tem uma situação, as
 * cheias e as que falham na reserva são marcadas, e a criação registra a sala
 * no diretório como o `onCreate` faria.
 */
class FakeSeatSource implements SeatSource<FakeReservation> {
  readonly directory: RoomDirectory = createRoomDirectory()
  readonly created: { address: string; arenaId: string; visibility: RoomVisibility }[] = []
  readonly events: Readonly<Record<string, unknown>>[] = []
  readonly #standings = new Map<string, RoomStanding>()
  readonly #full = new Set<string>()
  readonly #failing = new Set<string>()
  #seats = 0

  open(
    address: string,
    standing: Partial<RoomStanding> = {},
    visibility: RoomVisibility = 'public',
  ) {
    expectRoom(this.directory, address, visibility)
    registerRoom(this.directory, address, `sala-${address}`)
    this.#standings.set(address, {
      humans: 1,
      phase: 'live',
      phaseLeftS: 200,
      arenaId: NEON,
      ...standing,
    })
    return this
  }

  fill(address: string): this {
    this.#full.add(address)
    return this
  }

  failOn(address: string): this {
    this.#failing.add(address)
    return this
  }

  reserveIn(address: string): Promise<FakeReservation> {
    if (this.#failing.has(address)) return Promise.reject(new Error(`sala ${address} fechando`))
    return Promise.resolve(this.#reservation(address))
  }

  createAndReserve(address: string, arenaId: string, visibility: RoomVisibility) {
    this.created.push({ address, arenaId, visibility })
    this.open(address, { arenaId }, visibility)
    return Promise.resolve(this.#reservation(address))
  }

  drawFreeAddress(): string {
    return FREE
  }

  hasVacancy(address: string): boolean {
    return this.directory.rooms.has(address) && !this.#full.has(address)
  }

  standingOf(address: string): RoomStanding | undefined {
    return this.#standings.get(address)
  }

  offeredArenaOf(address: string): string {
    return this.#standings.get(address)?.arenaId ?? NEON
  }

  log(event: Readonly<Record<string, unknown>>): void {
    this.events.push(event)
  }

  #reservation(address: string): FakeReservation {
    this.#seats += 1
    return { sessionId: `s${this.#seats}`, roomId: `sala-${address}`, address }
  }
}

function enter(source: FakeSeatSource, request: Parameters<typeof routeRoomEntry>[2]) {
  return routeRoomEntry(source.directory, source, request, NEON)
}

describe('routeRoomEntry pelo endereço', () => {
  it('entra na sala do endereço com vaga', async () => {
    const source = new FakeSeatSource().open('1.1.1.1', { arenaId: ICHIBAN })
    const offer = await enter(source, { kind: 'address', address: '1.1.1.1', arenaId: NEON })
    expect(offer).toMatchObject({ address: '1.1.1.1', arenaId: ICHIBAN })
    expect(source.directory.queues.size).toBe(0)
  })

  /** Regressão: o link sem sala criava uma privada, e o jogador ficava preso nela. */
  it('sem sala no endereço, cria uma pública nele, no mapa de quem entra', async () => {
    const source = new FakeSeatSource()
    const offer = await enter(source, { kind: 'address', address: '1.1.1.1', arenaId: NEON })
    expect(source.created).toEqual([{ address: '1.1.1.1', arenaId: NEON, visibility: 'public' }])
    expect(offer.address).toBe('1.1.1.1')
  })

  it('com a sala cheia, joga na provisória e espera na fila da pedida', async () => {
    const source = new FakeSeatSource().open('1.1.1.1').fill('1.1.1.1').open('2.2.2.2')
    const offer = await enter(source, { kind: 'address', address: '1.1.1.1', arenaId: NEON })
    expect(offer.address).toBe('2.2.2.2')
    expect(source.directory.queues.get('1.1.1.1')).toEqual([
      { sessionId: offer.reservation.sessionId, roomId: 'sala-2.2.2.2' },
    ])
  })

  it('sem provisória com vaga, a provisória nasce pública num endereço livre', async () => {
    const source = new FakeSeatSource().open('1.1.1.1').fill('1.1.1.1')
    const offer = await enter(source, { kind: 'address', address: '1.1.1.1', arenaId: NEON })
    expect(offer.address).toBe(FREE)
    expect(source.created).toEqual([{ address: FREE, arenaId: NEON, visibility: 'public' }])
    expect(source.directory.queues.get('1.1.1.1')).toHaveLength(1)
  })
})

describe('routeRoomEntry na partida rápida', () => {
  it('entra na primeira sala da ordem', async () => {
    const source = new FakeSeatSource()
      .open('1.1.1.1', { humans: 1 })
      .open('2.2.2.2', { humans: 3 })
    const offer = await enter(source, { kind: 'quick', arenaId: NEON })
    expect(offer.address).toBe('2.2.2.2')
    expect(source.events).toEqual([
      { event: 'room.quick-match', address: '2.2.2.2', rank: 0, created: false },
    ])
  })

  /** A sala que fecha entre a ordem e a reserva não derruba a entrada. */
  it('pula a sala que recusa a reserva e tenta a próxima', async () => {
    const source = new FakeSeatSource()
      .open('1.1.1.1', { humans: 1 })
      .open('2.2.2.2', { humans: 3 })
      .failOn('2.2.2.2')
    const offer = await enter(source, { kind: 'quick', arenaId: NEON })
    expect(offer.address).toBe('1.1.1.1')
    expect(source.events[0]).toMatchObject({ event: 'room.quick-skip', address: '2.2.2.2' })
  })

  it('sem sala pública com vaga, cria uma pública', async () => {
    const source = new FakeSeatSource()
      .open('1.1.1.1', {}, 'private')
      .open('2.2.2.2')
      .fill('2.2.2.2')
    const offer = await enter(source, { kind: 'quick', arenaId: ICHIBAN })
    expect(offer).toMatchObject({ address: FREE })
    expect(source.created).toEqual([{ address: FREE, arenaId: NEON, visibility: 'public' }])
    expect(source.events).toEqual([{ event: 'room.quick-match', address: FREE, created: true }])
  })
})

describe('routeRoomEntry na sala nova', () => {
  it.each(['public', 'private'] as const)(
    'cria uma sala %s num endereço livre',
    async (visibility) => {
      const source = new FakeSeatSource()
      const offer = await enter(source, { kind: 'create', visibility, arenaId: NEON })
      expect(offer.address).toBe(FREE)
      expect(source.created).toEqual([{ address: FREE, arenaId: NEON, visibility }])
    },
  )

  /** A fila de outra sala não muda nada para quem pede sala nova. */
  it('ignora as filas', async () => {
    const source = new FakeSeatSource().open('1.1.1.1')
    enqueueWaiter(source.directory, '1.1.1.1', { sessionId: 'ana', roomId: 'sala-x' })
    const offer = await enter(source, { kind: 'create', visibility: 'public', arenaId: NEON })
    expect(offer.address).toBe(FREE)
  })
})

describe('offerAt', () => {
  it('leva o mapa que a sala oferece', () => {
    const source = new FakeSeatSource().open('1.1.1.1', { arenaId: ICHIBAN })
    const reservation = { sessionId: 'ana', roomId: 'sala-1.1.1.1', address: '1.1.1.1' }
    expect(offerAt(source, '1.1.1.1', reservation)).toEqual({
      reservation,
      address: '1.1.1.1',
      arenaId: ICHIBAN,
    })
  })
})
