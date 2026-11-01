import type { RoomVisibility } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  admitSeat,
  createRoomDirectory,
  enqueueWaiter,
  expectRoom,
  forgetWaiter,
  freeAddress,
  issueSeat,
  openPublicRooms,
  pendingSeatsAt,
  planEntry,
  type RoomDirectory,
  registerRoom as registerExpectedRoom,
  seatTargetOf,
  settleExpectedRoom,
  takeNextWaiter,
  takeReachableWaiter,
  unregisterRoom,
} from './roomDirectory.ts'

const REQUESTED = '203.0.113.7'
const OTHER = '198.51.100.9'

/** Como o matchmaking registra: pede a sala e ela se registra ao nascer. */
function registerRoom(
  directory: RoomDirectory,
  address: string,
  roomId: string,
  visibility: RoomVisibility = 'public',
): void {
  expectRoom(directory, address, visibility)
  registerExpectedRoom(directory, address, roomId)
}

/** As vagas de cada sala, como o colyseus as conta; aqui, um conjunto de endereços. */
class FakeVacancies {
  readonly #open = new Set<string>()

  open(address: string): this {
    this.#open.add(address)
    return this
  }

  readonly has = (address: string): boolean => this.#open.has(address)
}

describe('planEntry', () => {
  it('cria a sala do endereço que ainda não tem sala', () => {
    const directory = createRoomDirectory()
    expect(planEntry(directory, REQUESTED, new FakeVacancies().has)).toEqual({
      kind: 'create',
      address: REQUESTED,
    })
  })

  it('põe na sala do endereço quando há vaga e ninguém espera', () => {
    const directory = createRoomDirectory()
    registerRoom(directory, REQUESTED, 'sala-a')
    expect(planEntry(directory, REQUESTED, new FakeVacancies().open(REQUESTED).has)).toEqual({
      kind: 'join',
      address: REQUESTED,
    })
  })

  /** Regressão: o `joinOrCreate` do colyseus abria uma segunda sala com o mesmo endereço. */
  it('com a sala cheia, põe na fila e numa sala provisória com vaga', () => {
    const directory = createRoomDirectory()
    registerRoom(directory, REQUESTED, 'sala-a')
    registerRoom(directory, OTHER, 'sala-b')
    expect(planEntry(directory, REQUESTED, new FakeVacancies().open(OTHER).has)).toEqual({
      kind: 'wait',
      address: REQUESTED,
      provisional: OTHER,
    })
  })

  it('sem sala nenhuma com vaga, a provisória é uma sala nova', () => {
    const directory = createRoomDirectory()
    registerRoom(directory, REQUESTED, 'sala-a')
    registerRoom(directory, OTHER, 'sala-b')
    expect(planEntry(directory, REQUESTED, new FakeVacancies().has)).toMatchObject({
      kind: 'wait',
      provisional: undefined,
    })
  })

  /** A vaga que abriu é do primeiro da fila, não de quem acabou de chegar. */
  it('com gente na fila, quem chega espera mesmo que haja vaga', () => {
    const directory = createRoomDirectory()
    registerRoom(directory, REQUESTED, 'sala-a')
    enqueueWaiter(directory, REQUESTED, { sessionId: 'ana', roomId: 'sala-b' })
    expect(planEntry(directory, REQUESTED, new FakeVacancies().open(REQUESTED).has)).toMatchObject({
      kind: 'wait',
    })
  })

  it('não usa como provisória uma sala que tem fila própria', () => {
    const directory = createRoomDirectory()
    registerRoom(directory, REQUESTED, 'sala-a')
    registerRoom(directory, OTHER, 'sala-b')
    enqueueWaiter(directory, OTHER, { sessionId: 'ana', roomId: 'sala-c' })
    const vacancies = new FakeVacancies().open(OTHER)
    expect(planEntry(directory, REQUESTED, vacancies.has)).toMatchObject({ provisional: undefined })
  })

  /** Regressão: quem esperava na fila de uma sala caía na sala privada de outros. */
  it('não usa como provisória uma sala privada', () => {
    const directory = createRoomDirectory()
    registerRoom(directory, REQUESTED, 'sala-a')
    registerRoom(directory, OTHER, 'sala-b', 'private')
    const vacancies = new FakeVacancies().open(OTHER)
    expect(planEntry(directory, REQUESTED, vacancies.has)).toMatchObject({ provisional: undefined })
  })

  /** O link é o convite: pelo endereço, a sala privada recebe quem o abriu. */
  it('põe na sala privada quem abriu o endereço dela', () => {
    const directory = createRoomDirectory()
    registerRoom(directory, REQUESTED, 'sala-a', 'private')
    expect(planEntry(directory, REQUESTED, new FakeVacancies().open(REQUESTED).has)).toEqual({
      kind: 'join',
      address: REQUESTED,
    })
  })
})

describe('openPublicRooms', () => {
  it('lista só as salas públicas com vaga, sem fila e fora da pedida', () => {
    const directory = createRoomDirectory()
    const rooms = ['1.1.1.1', '1.1.1.2', '1.1.1.3', '1.1.1.4', '1.1.1.5']
    for (const address of rooms) registerRoom(directory, address, `sala-${address}`)
    registerRoom(directory, '1.1.1.6', 'sala-privada', 'private')
    enqueueWaiter(directory, '1.1.1.3', { sessionId: 'ana', roomId: 'sala-1.1.1.1' })
    const vacancies = new FakeVacancies().open('1.1.1.1').open('1.1.1.2').open('1.1.1.3')
    vacancies.open('1.1.1.5').open('1.1.1.6')
    expect([...openPublicRooms(directory, vacancies.has, '1.1.1.5')]).toEqual([
      '1.1.1.1',
      '1.1.1.2',
    ])
  })
})

describe('seatTargetOf', () => {
  const noFreeAddress = (): string => {
    throw new Error('sem sorteio neste plano')
  }

  /** Um link sem sala atrás dele é um convite: a sala nasce privada. */
  it('cria a sala pedida privada, ou entra nela, sem fila', () => {
    expect(seatTargetOf({ kind: 'create', address: REQUESTED }, noFreeAddress)).toEqual({
      address: REQUESTED,
      create: true,
      queued: false,
      visibility: 'private',
    })
    expect(seatTargetOf({ kind: 'join', address: REQUESTED }, noFreeAddress)).toEqual({
      address: REQUESTED,
      create: false,
      queued: false,
    })
  })

  it('na espera, entra na provisória com vaga e fica na fila', () => {
    const plan = { kind: 'wait', address: REQUESTED, provisional: OTHER } as const
    expect(seatTargetOf(plan, noFreeAddress)).toEqual({
      address: OTHER,
      create: false,
      queued: true,
    })
  })

  it('na espera sem provisória, cria uma pública num endereço livre e fica na fila', () => {
    const plan = { kind: 'wait', address: REQUESTED, provisional: undefined } as const
    expect(seatTargetOf(plan, () => OTHER)).toEqual({
      address: OTHER,
      create: true,
      queued: true,
      visibility: 'public',
    })
  })
})

describe('freeAddress', () => {
  /** Os sorteios, um por chamada, na ordem dada. */
  function sequence(...draws: number[]): () => number {
    const expected = draws.length
    return () => {
      const draw = draws.shift()
      if (draw === undefined) throw new Error(`sorteio a mais; esperado ${expected}`)
      return draw
    }
  }

  it('sorteia de novo enquanto o endereço for de uma sala aberta', () => {
    const directory = createRoomDirectory()
    registerRoom(directory, '8.8.4.4', 'sala-a')
    expect(freeAddress(directory, sequence(0x08_08_04_04, 0x01_01_01_01))).toBe('1.1.1.1')
  })

  /** Duas criações seguidas não podem sortear o endereço da que ainda nasce. */
  it('sorteia de novo enquanto o endereço for de uma sala a caminho', () => {
    const directory = createRoomDirectory()
    expectRoom(directory, '8.8.4.4', 'private')
    expect(freeAddress(directory, sequence(0x08_08_04_04, 0x01_01_01_01))).toBe('1.1.1.1')
  })
})

describe('registerRoom', () => {
  it('recusa um segundo roomId para o mesmo endereço, dizendo os dois', () => {
    const directory = createRoomDirectory()
    registerRoom(directory, REQUESTED, 'sala-a')
    expect(() => registerRoom(directory, REQUESTED, 'sala-b')).toThrow(/'sala-a'.*'sala-b'/)
  })

  it('libera o endereço e descarta a fila e a visibilidade quando a sala fecha', () => {
    const directory = createRoomDirectory()
    registerRoom(directory, REQUESTED, 'sala-a', 'private')
    enqueueWaiter(directory, REQUESTED, { sessionId: 'ana', roomId: 'sala-b' })
    unregisterRoom(directory, REQUESTED)
    expect(directory.rooms.has(REQUESTED)).toBe(false)
    expect(directory.queues.has(REQUESTED)).toBe(false)
    expect(directory.privateRooms.has(REQUESTED)).toBe(false)
  })

  it('guarda a visibilidade pedida quando a sala se registra', () => {
    const directory = createRoomDirectory()
    registerRoom(directory, REQUESTED, 'sala-a', 'private')
    registerRoom(directory, OTHER, 'sala-b', 'public')
    expect([...directory.privateRooms]).toEqual([REQUESTED])
    expect(directory.expectedRooms.size).toBe(0)
  })

  it('uma criação que falhou não deixa nada para trás', () => {
    const directory = createRoomDirectory()
    expectRoom(directory, REQUESTED, 'private')
    settleExpectedRoom(directory, REQUESTED)
    expect(directory.expectedRooms.size).toBe(0)
    expect(directory.privateRooms.size).toBe(0)
    expect(() => registerExpectedRoom(directory, REQUESTED, 'sala-x')).toThrow(/'sala-x'/)
  })
})

describe('rota padrão do colyseus', () => {
  /** Regressão: `/matchmake/create` ainda responde, e criaria a sala de um endereço. */
  it('recusa a sala que o matchmaking não pediu, dizendo endereço e sala', () => {
    const directory = createRoomDirectory()
    expect(() => registerExpectedRoom(directory, REQUESTED, 'sala-x')).toThrow(
      /'sala-x'.*'203\.0\.113\.7'/,
    )
    expect(directory.rooms.has(REQUESTED)).toBe(false)
  })

  /** Regressão: `/matchmake/joinOrCreate` ainda responde, e pularia a fila. */
  it('só admite o assento que o matchmaking reservou, uma vez', () => {
    const directory = createRoomDirectory()
    issueSeat(directory, 'ana', REQUESTED)
    expect(admitSeat(directory, 'intruso')).toBe(false)
    expect(admitSeat(directory, 'ana')).toBe(true)
    expect(admitSeat(directory, 'ana')).toBe(false)
  })
})

describe('pendingSeatsAt', () => {
  it('conta os assentos a caminho de cada sala, até a entrada', () => {
    const directory = createRoomDirectory()
    issueSeat(directory, 'ana', REQUESTED)
    issueSeat(directory, 'bia', REQUESTED)
    issueSeat(directory, 'caio', OTHER)
    expect(pendingSeatsAt(directory, REQUESTED)).toBe(2)
    admitSeat(directory, 'ana')
    expect(pendingSeatsAt(directory, REQUESTED)).toBe(1)
    expect(pendingSeatsAt(directory, OTHER)).toBe(1)
  })
})

describe('fila', () => {
  it('chama por ordem de chegada e apaga a fila vazia', () => {
    const directory = createRoomDirectory()
    enqueueWaiter(directory, REQUESTED, { sessionId: 'ana', roomId: 'sala-b' })
    enqueueWaiter(directory, REQUESTED, { sessionId: 'bia', roomId: 'sala-c' })
    expect(takeNextWaiter(directory, REQUESTED)?.sessionId).toBe('ana')
    expect(takeNextWaiter(directory, REQUESTED)?.sessionId).toBe('bia')
    expect(takeNextWaiter(directory, REQUESTED)).toBeUndefined()
    expect(directory.queues.has(REQUESTED)).toBe(false)
  })

  it('chama o primeiro que ainda está no jogo, e tira da fila quem saiu', () => {
    const directory = createRoomDirectory()
    enqueueWaiter(directory, REQUESTED, { sessionId: 'ana', roomId: 'sala-b' })
    enqueueWaiter(directory, REQUESTED, { sessionId: 'bia', roomId: 'sala-c' })
    enqueueWaiter(directory, REQUESTED, { sessionId: 'caio', roomId: 'sala-c' })
    const inGame = (waiter: { sessionId: string }): boolean => waiter.sessionId !== 'ana'
    expect(takeReachableWaiter(directory, REQUESTED, inGame)?.sessionId).toBe('bia')
    expect(directory.queues.get(REQUESTED)).toEqual([{ sessionId: 'caio', roomId: 'sala-c' }])
  })

  it('com ninguém da fila no jogo, não chama ninguém', () => {
    const directory = createRoomDirectory()
    enqueueWaiter(directory, REQUESTED, { sessionId: 'ana', roomId: 'sala-b' })
    expect(takeReachableWaiter(directory, REQUESTED, () => false)).toBeUndefined()
    expect(directory.queues.has(REQUESTED)).toBe(false)
  })

  it('tira de toda fila quem saiu do jogo', () => {
    const directory = createRoomDirectory()
    enqueueWaiter(directory, REQUESTED, { sessionId: 'ana', roomId: 'sala-b' })
    enqueueWaiter(directory, REQUESTED, { sessionId: 'bia', roomId: 'sala-c' })
    enqueueWaiter(directory, OTHER, { sessionId: 'ana', roomId: 'sala-b' })
    forgetWaiter(directory, 'ana')
    expect(directory.queues.get(REQUESTED)).toEqual([{ sessionId: 'bia', roomId: 'sala-c' }])
    expect(directory.queues.has(OTHER)).toBe(false)
  })
})
