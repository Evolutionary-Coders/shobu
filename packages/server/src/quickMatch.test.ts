import { describe, expect, it } from 'vitest'
import { QUICK_MATCH_LATE_JOIN_S, type RoomStanding, rankQuickMatchRooms } from './quickMatch.ts'
import {
  createRoomDirectory,
  enqueueWaiter,
  expectRoom,
  issueSeat,
  type RoomDirectory,
  registerRoom,
} from './roomDirectory.ts'

const NEON = 'neon-kaido'
const ICHIBAN = 'ichiban-gai'

/** As salas abertas, com a situação de cada uma e as vagas que o colyseus contaria. */
class FakeRooms {
  readonly directory: RoomDirectory = createRoomDirectory()
  readonly #standings = new Map<string, RoomStanding>()
  readonly #full = new Set<string>()

  open(address: string, standing: Partial<RoomStanding> = {}, isPrivate = false): this {
    expectRoom(this.directory, address, isPrivate ? 'private' : 'public')
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

  forgetStanding(address: string): this {
    this.#standings.delete(address)
    return this
  }

  rank(wantedArenaId = NEON): readonly string[] {
    return rankQuickMatchRooms(
      this.directory,
      (address) => this.#standings.get(address),
      (address) => !this.#full.has(address),
      wantedArenaId,
    )
  }
}

describe('rankQuickMatchRooms', () => {
  it('põe a sala mais cheia primeiro', () => {
    const rooms = new FakeRooms()
      .open('1.1.1.1', { humans: 1 })
      .open('1.1.1.2', { humans: 3 })
      .open('1.1.1.3', { humans: 2 })
    expect(rooms.rank()).toEqual(['1.1.1.2', '1.1.1.3', '1.1.1.1'])
  })

  it('conta os assentos a caminho da sala como gente nela', () => {
    const rooms = new FakeRooms().open('1.1.1.1', { humans: 2 }).open('1.1.1.2', { humans: 1 })
    issueSeat(rooms.directory, 'ana', '1.1.1.2')
    issueSeat(rooms.directory, 'bia', '1.1.1.2')
    expect(rooms.rank()).toEqual(['1.1.1.2', '1.1.1.1'])
  })

  it('prefere o aquecimento a uma sala mais cheia no resultado', () => {
    const rooms = new FakeRooms()
      .open('1.1.1.1', { humans: 3, phase: 'results', phaseLeftS: 5 })
      .open('1.1.1.2', { humans: 1, phase: 'warmup', phaseLeftS: 10 })
    expect(rooms.rank()).toEqual(['1.1.1.2', '1.1.1.1'])
  })

  /** Cair numa partida com 20 s pela frente é jogar 20 s; o intervalo recomeça em 10. */
  it('deixa a partida no fim depois do intervalo', () => {
    const rooms = new FakeRooms()
      .open('1.1.1.1', { humans: 3, phaseLeftS: QUICK_MATCH_LATE_JOIN_S - 1 })
      .open('1.1.1.2', { humans: 1, phase: 'over', phaseLeftS: 2 })
      .open('1.1.1.3', { humans: 1, phaseLeftS: QUICK_MATCH_LATE_JOIN_S })
    expect(rooms.rank()).toEqual(['1.1.1.3', '1.1.1.2', '1.1.1.1'])
  })

  it('entre salas igualmente cheias, a que tem mais partida pela frente', () => {
    const rooms = new FakeRooms()
      .open('1.1.1.1', { phaseLeftS: 100 })
      .open('1.1.1.2', { phase: 'warmup', phaseLeftS: 3 })
      .open('1.1.1.3', { phaseLeftS: 250 })
      .open('1.1.1.4', { phase: 'warmup', phaseLeftS: 9 })
    expect(rooms.rank()).toEqual(['1.1.1.4', '1.1.1.2', '1.1.1.3', '1.1.1.1'])
  })

  it('no intervalo, a sala que recomeça antes', () => {
    const rooms = new FakeRooms()
      .open('1.1.1.1', { phase: 'over', phaseLeftS: 1 })
      .open('1.1.1.2', { phase: 'results', phaseLeftS: 8 })
      .open('1.1.1.3', { phase: 'decided', phaseLeftS: 1 })
      .open('1.1.1.4', { phase: 'results', phaseLeftS: 2 })
    expect(rooms.rank()).toEqual(['1.1.1.3', '1.1.1.4', '1.1.1.2', '1.1.1.1'])
  })

  it('no empate, o mesmo mapa de quem entra, e depois o endereço', () => {
    const rooms = new FakeRooms()
      .open('1.1.1.3', { arenaId: NEON })
      .open('1.1.1.2', { arenaId: ICHIBAN })
      .open('1.1.1.1', { arenaId: NEON })
    expect(rooms.rank(ICHIBAN)).toEqual(['1.1.1.2', '1.1.1.1', '1.1.1.3'])
    expect(rooms.rank(NEON)).toEqual(['1.1.1.1', '1.1.1.3', '1.1.1.2'])
  })

  it('deixa de fora a sala privada, a com fila, a cheia e a sem situação', () => {
    const rooms = new FakeRooms()
      .open('1.1.1.1')
      .open('1.1.1.2', {}, true)
      .open('1.1.1.3')
      .open('1.1.1.4')
      .fill('1.1.1.4')
      .open('1.1.1.5')
      .forgetStanding('1.1.1.5')
    enqueueWaiter(rooms.directory, '1.1.1.3', { sessionId: 'ana', roomId: 'sala-1.1.1.1' })
    expect(rooms.rank()).toEqual(['1.1.1.1'])
  })

  it('sem sala aberta, não há candidata', () => {
    expect(new FakeRooms().rank()).toEqual([])
  })
})
