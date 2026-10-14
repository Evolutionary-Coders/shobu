import { describe, expect, it } from 'vitest'
import {
  admitSeat,
  createRoomDirectory,
  enqueueWaiter,
  expectRoom,
  forgetWaiter,
  freeAddress,
  issueSeat,
  planEntry,
  type RoomDirectory,
  registerRoom as registerExpectedRoom,
  seatTargetOf,
  takeNextWaiter,
  takeReachableWaiter,
  unregisterRoom,
} from './roomDirectory.ts'

const REQUESTED = '203.0.113.7'
const OTHER = '198.51.100.9'

/** Como o matchmaking registra: pede a sala e ela se registra ao nascer. */
function registerRoom(directory: RoomDirectory, address: string, roomId: string): void {
  expectRoom(directory, address)
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
})

describe('seatTargetOf', () => {
  const noFreeAddress = (): string => {
    throw new Error('sem sorteio neste plano')
  }

  it('cria a sala pedida, ou entra nela, sem fila', () => {
    expect(seatTargetOf({ kind: 'create', address: REQUESTED }, noFreeAddress)).toEqual({
      address: REQUESTED,
      create: true,
      queued: false,
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

  it('na espera sem provisória, cria uma num endereço livre e fica na fila', () => {
    const plan = { kind: 'wait', address: REQUESTED, provisional: undefined } as const
    expect(seatTargetOf(plan, () => OTHER)).toEqual({ address: OTHER, create: true, queued: true })
  })
})

describe('freeAddress', () => {
  it('sorteia de novo enquanto o endereço for de uma sala aberta', () => {
    const directory = createRoomDirectory()
    registerRoom(directory, '8.8.4.4', 'sala-a')
    const draws = [0x08_08_04_04, 0x01_01_01_01]
    const next = (): number => {
      const draw = draws.shift()
      if (draw === undefined) throw new Error('sorteio a mais; esperado dois')
      return draw
    }
    expect(freeAddress(directory, next)).toBe('1.1.1.1')
  })
})

describe('registerRoom', () => {
  it('recusa um segundo roomId para o mesmo endereço, dizendo os dois', () => {
    const directory = createRoomDirectory()
    registerRoom(directory, REQUESTED, 'sala-a')
    expect(() => registerRoom(directory, REQUESTED, 'sala-b')).toThrow(/'sala-a'.*'sala-b'/)
  })

  it('libera o endereço e descarta a fila quando a sala fecha', () => {
    const directory = createRoomDirectory()
    registerRoom(directory, REQUESTED, 'sala-a')
    enqueueWaiter(directory, REQUESTED, { sessionId: 'ana', roomId: 'sala-b' })
    unregisterRoom(directory, REQUESTED)
    expect(directory.rooms.has(REQUESTED)).toBe(false)
    expect(directory.queues.has(REQUESTED)).toBe(false)
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
    issueSeat(directory, 'ana')
    expect(admitSeat(directory, 'intruso')).toBe(false)
    expect(admitSeat(directory, 'ana')).toBe(true)
    expect(admitSeat(directory, 'ana')).toBe(false)
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
