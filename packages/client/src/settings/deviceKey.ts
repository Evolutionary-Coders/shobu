import { parseDeviceKey } from '@shobu/core'
import { createJsonStore, type SettingsStorage } from './jsonStore.ts'

/** Onde a chave do aparelho mora: uma por navegador, dividida pelas abas. */
export const DEVICE_KEY_KEY = 'shobu.deviceKey'

/** Os bytes da chave: 128 bits, como um uuid, em 32 dígitos hexadecimais. */
const DEVICE_KEY_BYTES = 16

/**
 * A chave do aparelho, lida do armazenamento ou criada e guardada na primeira
 * vez. Vai no pedido de entrada, e é por ela que o banimento da sala reconhece
 * quem o voto expulsou (ADR 0034). Os bytes vêm injetados: o `randomUUID` só
 * existe em contexto seguro, e o `getRandomValues` existe em qualquer um.
 * Sem armazenamento (aba anônima do safari), cada leitura cria uma chave nova:
 * o banimento não pega, e o jogo segue.
 *
 * ```ts
 * readDeviceKey(window.localStorage, (n) => crypto.getRandomValues(new Uint8Array(n)))
 * // '9f2c4e1a0b3d5f7e8a6c4b2d0e1f3a5c'
 * ```
 */
export function readDeviceKey(
  storage: SettingsStorage,
  randomBytes: (count: number) => Uint8Array,
): string {
  const store = createJsonStore(storage, DEVICE_KEY_KEY, parseDeviceKey)
  const stored = store.read()
  if (stored !== '') return stored
  const created = hexOf(randomBytes(DEVICE_KEY_BYTES))
  store.write(created)
  return created
}

function hexOf(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
