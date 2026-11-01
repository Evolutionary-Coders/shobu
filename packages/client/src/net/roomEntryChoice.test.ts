import { describe, expect, it } from 'vitest'
import type { MenuAction } from '../menu/mainMenuModel.ts'
import type { SettingsStorage } from '../settings/jsonStore.ts'
import {
  CREATED_ROOM_KEY,
  createCreatedRoomStore,
  createdRoomHere,
  parseCreatedRoom,
  type RoomEntryAsk,
  type RoomHere,
  roomEntryFor,
} from './roomEntryChoice.ts'

const ARENA = 'neon-kaido'
const ROOM = '93.184.216.34'

/** O armazenamento da aba, em memória. */
class FakeTabStorage implements SettingsStorage {
  readonly items = new Map<string, string>()
  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }
}

function ask(action: MenuAction, overrides: Partial<RoomEntryAsk> = {}): RoomEntryAsk {
  return { action, privateRoom: false, arenaId: ARENA, fromRematch: false, ...overrides }
}

const NO_ROOM: RoomHere = { joined: false, createdHere: undefined }
const SOMEONE_ELSES_ROOM: RoomHere = { joined: true, createdHere: undefined }

describe('roomEntryFor', () => {
  it.each(['deploy', 'deploy-headset', 'train'] as const)(
    'sem sala, %s pede a partida rápida no mapa subido',
    (action) => {
      expect(roomEntryFor(ask(action), NO_ROOM)).toEqual({ kind: 'quick', arenaId: ARENA })
    },
  )

  /** Quem abriu o link do amigo e aperta ENTRAR continua com o amigo. */
  it.each(['deploy', 'deploy-headset', 'train'] as const)(
    'já numa sala, %s fica nela',
    (action) => {
      expect(roomEntryFor(ask(action), SOMEONE_ELSES_ROOM)).toBe('stay')
    },
  )

  it.each([
    [false, 'public'],
    [true, 'private'],
  ] as const)('COMEÇAR com PRIVADA %s cria uma sala %s', (privateRoom, visibility) => {
    expect(roomEntryFor(ask('deploy-match', { privateRoom }), NO_ROOM)).toEqual({
      kind: 'create',
      visibility,
      arenaId: ARENA,
    })
  })

  it('COMEÇAR na sala de outro cria uma sala nova', () => {
    expect(roomEntryFor(ask('deploy-match'), SOMEONE_ELSES_ROOM)).toEqual({
      kind: 'create',
      visibility: 'public',
      arenaId: ARENA,
    })
  })

  it('COMEÇAR na sala que a aba criou com a mesma visibilidade fica nela', () => {
    const here: RoomHere = { joined: true, createdHere: 'private' }
    expect(roomEntryFor(ask('deploy-match', { privateRoom: true }), here)).toBe('stay')
  })

  it('COMEÇAR na sala que a aba criou com a outra visibilidade cria outra', () => {
    const here: RoomHere = { joined: true, createdHere: 'public' }
    expect(roomEntryFor(ask('deploy-match', { privateRoom: true }), here)).toEqual({
      kind: 'create',
      visibility: 'private',
      arenaId: ARENA,
    })
  })

  /** O voto e o mapa da sala recarregam a página, que volta à sala no boot. */
  it('depois da recarga, já de volta numa sala, fica nela mesmo no COMEÇAR', () => {
    const rematch = ask('deploy-match', { fromRematch: true })
    expect(roomEntryFor(rematch, SOMEONE_ELSES_ROOM)).toBe('stay')
  })

  /** COMEÇAR noutro mapa recarrega sem endereço: a sala nova nasce depois do gesto. */
  it('depois da recarga sem sala, a ação vale como sempre', () => {
    const rematch = ask('deploy-match', { fromRematch: true, privateRoom: true })
    expect(roomEntryFor(rematch, NO_ROOM)).toEqual({
      kind: 'create',
      visibility: 'private',
      arenaId: ARENA,
    })
  })

  it.each(['none', 'edit-profile-name'] as const)('%s não entra em sala nenhuma', (action) => {
    expect(roomEntryFor(ask(action), NO_ROOM)).toBe('stay')
  })
})

describe('parseCreatedRoom', () => {
  it('lê a sala guardada', () => {
    expect(parseCreatedRoom({ address: ROOM, visibility: 'private' })).toEqual({
      address: ROOM,
      visibility: 'private',
    })
  })

  it.each([
    null,
    'sala',
    { address: 7, visibility: 'public' },
    { address: ROOM, visibility: 'trancada' },
    { address: ROOM },
  ])('descarta %j', (raw) => {
    expect(parseCreatedRoom(raw)).toBeNull()
  })
})

describe('createdRoomHere', () => {
  const created = { address: ROOM, visibility: 'public' } as const

  it('na sala que a aba criou, devolve a visibilidade dela', () => {
    expect(createdRoomHere(created, ROOM)).toBe('public')
  })

  it.each([undefined, '203.0.113.7'])('fora dela (%j), não conta', (current) => {
    expect(createdRoomHere(created, current)).toBeUndefined()
  })

  it('sem sala criada, não conta', () => {
    expect(createdRoomHere(null, ROOM)).toBeUndefined()
  })
})

describe('createCreatedRoomStore', () => {
  it('guarda e lê a sala criada na chave da aba', () => {
    const storage = new FakeTabStorage()
    const store = createCreatedRoomStore(storage)
    store.write({ address: ROOM, visibility: 'private' })
    expect(storage.items.has(CREATED_ROOM_KEY)).toBe(true)
    expect(store.read()).toEqual({ address: ROOM, visibility: 'private' })
  })

  it('sem nada guardado, lê null', () => {
    expect(createCreatedRoomStore(new FakeTabStorage()).read()).toBeNull()
  })
})
