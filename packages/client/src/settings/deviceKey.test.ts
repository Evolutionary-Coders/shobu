import { parseDeviceKey } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { DEVICE_KEY_KEY, readDeviceKey } from './deviceKey.ts'
import { createMemorySettingsStorage, type SettingsStorage } from './playerSettingsStore.ts'

/** Bytes sempre iguais, contando quantas vezes pediram. */
class CountingBytes {
  calls = 0

  readonly next = (count: number): Uint8Array => {
    this.calls += 1
    return Uint8Array.from({ length: count }, (_, index) => index * 17)
  }
}

/** O safari em aba anônima: nada se lê, nada se guarda. */
class ThrowingStorage implements SettingsStorage {
  getItem(): string | null {
    throw new DOMException('SecurityError')
  }

  setItem(): void {
    throw new DOMException('QuotaExceededError')
  }
}

describe('readDeviceKey', () => {
  it('cria uma chave que o servidor aceita, e a guarda', () => {
    const storage = createMemorySettingsStorage()
    const key = readDeviceKey(storage, new CountingBytes().next)
    expect(key).toBe('00112233445566778899aabbccddeeff')
    expect(parseDeviceKey(key)).toBe(key)
    expect(storage.getItem(DEVICE_KEY_KEY)).toBe(JSON.stringify(key))
  })

  it('lê a chave guardada sem criar outra', () => {
    const storage = createMemorySettingsStorage()
    const bytes = new CountingBytes()
    const first = readDeviceKey(storage, bytes.next)
    expect(readDeviceKey(storage, bytes.next)).toBe(first)
    expect(bytes.calls).toBe(1)
  })

  it('troca a chave guardada que não vale', () => {
    const storage = createMemorySettingsStorage()
    storage.setItem(DEVICE_KEY_KEY, JSON.stringify('<script>'))
    expect(readDeviceKey(storage, new CountingBytes().next)).toHaveLength(32)
  })

  it('sem armazenamento, ainda devolve uma chave', () => {
    expect(readDeviceKey(new ThrowingStorage(), new CountingBytes().next)).toHaveLength(32)
  })
})
