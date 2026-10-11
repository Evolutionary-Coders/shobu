import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAYER_SETTINGS } from './playerSettingsSpec.ts'
import {
  createMemorySettingsStorage,
  createPlayerSettingsStore,
  PLAYER_SETTINGS_KEY,
  type SettingsStorage,
} from './playerSettingsStore.ts'

/** Armazenamento de mentira: anota o que guardaram, sem dom. */
class FakeStorage implements SettingsStorage {
  readonly entries = new Map<string, string>()

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value)
  }
}

/** O safari em aba anônima, a cota estourada e o cookie bloqueado, num só duplo. */
class ThrowingStorage implements SettingsStorage {
  getItem(): string | null {
    throw new DOMException('SecurityError')
  }

  setItem(): void {
    throw new DOMException('QuotaExceededError')
  }
}

describe('createPlayerSettingsStore', () => {
  it('sem nada guardado devolve o padrão', () => {
    expect(createPlayerSettingsStore(new FakeStorage()).read()).toEqual(DEFAULT_PLAYER_SETTINGS)
  })

  it('o que foi escrito volta na leitura', () => {
    const store = createPlayerSettingsStore(new FakeStorage())
    const escolhido = { ...DEFAULT_PLAYER_SETTINGS, fieldOfViewDeg: 110 }
    store.write(escolhido)
    expect(store.read()).toEqual(escolhido)
  })

  it('guarda sob uma chave com prefixo do jogo', () => {
    const storage = new FakeStorage()
    createPlayerSettingsStore(storage).write(DEFAULT_PLAYER_SETTINGS)
    expect([...storage.entries.keys()]).toEqual([PLAYER_SETTINGS_KEY])
  })
})

/**
 * As três formas de o armazenamento estar quebrado. Nenhuma pode derrubar o
 * boot: o custo de falhar é o jogador perder a preferência, e o de lançar é a
 * demo morrer na frente de quem veio ver.
 */
describe('createPlayerSettingsStore: armazenamento hostil', () => {
  it('json quebrado vira o padrão em vez de exceção', () => {
    const storage = new FakeStorage()
    storage.setItem(PLAYER_SETTINGS_KEY, '{isto não é json')
    expect(createPlayerSettingsStore(storage).read()).toEqual(DEFAULT_PLAYER_SETTINGS)
  })

  it('json válido de forma errada vira o padrão', () => {
    const storage = new FakeStorage()
    storage.setItem(PLAYER_SETTINGS_KEY, '"texto solto"')
    expect(createPlayerSettingsStore(storage).read()).toEqual(DEFAULT_PLAYER_SETTINGS)
  })

  it('leitura que lança vira o padrão', () => {
    expect(createPlayerSettingsStore(new ThrowingStorage()).read()).toEqual(DEFAULT_PLAYER_SETTINGS)
  })

  it('escrita que lança não propaga', () => {
    const store = createPlayerSettingsStore(new ThrowingStorage())
    expect(() => store.write(DEFAULT_PLAYER_SETTINGS)).not.toThrow()
  })
})

describe('createMemorySettingsStorage', () => {
  it('guarda e devolve dentro da mesma aba', () => {
    const storage = createMemorySettingsStorage()
    storage.setItem('k', 'v')
    expect(storage.getItem('k')).toBe('v')
  })

  it('devolve nulo para o que nunca foi escrito', () => {
    expect(createMemorySettingsStorage().getItem('k')).toBeNull()
  })

  it('serve de armazenamento para o store inteiro', () => {
    const store = createPlayerSettingsStore(createMemorySettingsStorage())
    const escolhido = { ...DEFAULT_PLAYER_SETTINGS, mouseSensitivity: 2 }
    store.write(escolhido)
    expect(store.read()).toEqual(escolhido)
  })
})
