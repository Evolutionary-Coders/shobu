import { sanitizeProfileName } from '@shobu/core'
import { createJsonStore, type JsonStore, type SettingsStorage } from './jsonStore.ts'

/** Onde o nome mora. Chave própria: o json das configurações é só de números. */
export const PROFILE_NAME_KEY = 'shobu.profileName'

/**
 * ```ts
 * const store = createProfileNameStore(window.localStorage)
 * store.write(sanitizeProfileName(input.value))
 * ```
 */
export function createProfileNameStore(storage: SettingsStorage): JsonStore<string> {
  return createJsonStore(storage, PROFILE_NAME_KEY, sanitizeProfileName)
}
