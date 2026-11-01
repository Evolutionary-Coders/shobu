import { describe, expect, it } from 'vitest'
import {
  createRoomSeatState,
  entryFailed,
  holdSeat,
  launchEntry,
  reloadKindOf,
  roomClosed,
  roomHereOf,
  roomLeavingWithPage,
  type SeatedRoom,
  seatTaken,
  startEntry,
} from './roomSeatState.ts'

const ARENA = 'neon-kaido'
const QUICK = { kind: 'quick', arenaId: ARENA } as const
const PRIVATE = { kind: 'create', visibility: 'private', arenaId: ARENA } as const

/** Uma sala ocupada, sem rede: só o endereço e o token da volta. */
class FakeSeatedRoom implements SeatedRoom {
  constructor(
    readonly address: string,
    readonly reconnectionToken = `token-${address}`,
  ) {}
}

describe('o pedido de assento', () => {
  it('em voo, conta como sala para a escolha da entrada', () => {
    const state = createRoomSeatState<FakeSeatedRoom>()
    expect(roomHereOf(state, null)).toEqual({ joined: false, createdHere: undefined })
    startEntry(state, QUICK)
    expect(roomHereOf(state, null).joined).toBe(true)
  })

  /** Regressão: o segundo pedido trocava a sala criada guardada, e a resposta mais lenta decidia. */
  it('com um pedido em voo, recusa o segundo e guarda a sala do primeiro', () => {
    const state = createRoomSeatState<FakeSeatedRoom>()
    expect(startEntry(state, PRIVATE)).toBe(true)
    expect(startEntry(state, QUICK)).toBe(false)
    expect(seatTaken(state, new FakeSeatedRoom('1.1.1.1'))).toEqual({
      address: '1.1.1.1',
      visibility: 'private',
    })
    expect(startEntry(state, QUICK)).toBe(true)
  })

  it('ocupado, devolve a sala criada para a aba guardar', () => {
    const state = createRoomSeatState<FakeSeatedRoom>()
    startEntry(state, PRIVATE)
    const room = new FakeSeatedRoom('1.1.1.1')
    const created = seatTaken(state, room)
    expect(created).toEqual({ address: '1.1.1.1', visibility: 'private' })
    expect(roomHereOf(state, created ?? null)).toEqual({ joined: true, createdHere: 'private' })
    expect(state.asking).toBe(false)
  })

  it('sem criar sala, não há o que guardar', () => {
    const state = createRoomSeatState<FakeSeatedRoom>()
    startEntry(state, QUICK)
    expect(seatTaken(state, new FakeSeatedRoom('1.1.1.1'))).toBeUndefined()
  })

  it('falhou: a página fica sem pedido, e a ENTRAR seguinte pede de novo', () => {
    const state = createRoomSeatState<FakeSeatedRoom>()
    startEntry(state, PRIVATE)
    entryFailed(state)
    expect(roomHereOf(state, null).joined).toBe(false)
    expect(seatTaken(state, new FakeSeatedRoom('1.1.1.1'))).toBeUndefined()
  })
})

describe('roomClosed', () => {
  it('a sala de agora fechada deixa a página sem sala', () => {
    const state = createRoomSeatState<FakeSeatedRoom>()
    const room = new FakeSeatedRoom('1.1.1.1')
    seatTaken(state, room)
    roomClosed(state, room)
    expect(roomHereOf(state, null).joined).toBe(false)
  })

  /** A troca de sala deixa a anterior depois de ocupar a nova: o fechamento dela não conta. */
  it('a sala anterior fechada não mexe na de agora', () => {
    const state = createRoomSeatState<FakeSeatedRoom>()
    const before = new FakeSeatedRoom('1.1.1.1')
    const now = new FakeSeatedRoom('2.2.2.2')
    seatTaken(state, before)
    seatTaken(state, now)
    roomClosed(state, before)
    expect(state.room).toBe(now)
  })
})

describe('launchEntry e reloadKindOf', () => {
  it('antes do clique, a recarga no mapa da sala volta ao menu', () => {
    expect(reloadKindOf(createRoomSeatState())).toBe('menu')
  })

  it('o clique devolve o pedido, e a recarga passa a voltar ao CLIQUE PARA ENTRAR', () => {
    const state = createRoomSeatState<FakeSeatedRoom>()
    expect(launchEntry(state, QUICK)).toEqual(QUICK)
    expect(reloadKindOf(state)).toBe('entry')
  })

  it("ficar ('stay') não pede nada, mas também conta como clique", () => {
    const state = createRoomSeatState<FakeSeatedRoom>()
    expect(launchEntry(state, 'stay')).toBeUndefined()
    expect(reloadKindOf(state)).toBe('entry')
  })
})

describe('holdSeat e roomLeavingWithPage', () => {
  it('sem sala, não há vaga a segurar nem sala a deixar', () => {
    const state = createRoomSeatState<FakeSeatedRoom>()
    expect(holdSeat(state)).toBeUndefined()
    expect(roomLeavingWithPage(state)).toBeUndefined()
  })

  it('a sala de agora sai com a página', () => {
    const state = createRoomSeatState<FakeSeatedRoom>()
    const room = new FakeSeatedRoom('1.1.1.1')
    seatTaken(state, room)
    expect(roomLeavingWithPage(state)).toBe(room)
  })

  /** Sair na recarga do voto soltaria a vaga na hora (ADR 0031). */
  it('com a vaga segurada, a página sai sem deixar a sala, e o token vai para a aba', () => {
    const state = createRoomSeatState<FakeSeatedRoom>()
    seatTaken(state, new FakeSeatedRoom('1.1.1.1', 'volta'))
    expect(holdSeat(state)).toEqual({ address: '1.1.1.1', token: 'volta' })
    expect(roomLeavingWithPage(state)).toBeUndefined()
  })
})
