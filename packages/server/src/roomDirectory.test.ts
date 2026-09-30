import { describe, expect, it } from 'vitest'
import {
  createRoomDirectory,
  enqueueWaiter,
  forgetWaiter,
  planEntry,
  registerRoom,
  takeNextWaiter,
  unregisterRoom,
} from './roomDirectory.ts'

const REQUESTED = '203.0.113.7'
const OTHER = '198.51.100.9'

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
