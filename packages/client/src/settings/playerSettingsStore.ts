import { createJsonStore, type JsonStore } from './jsonStore.ts'
import { parsePlayerSettings } from './parsePlayerSettings.ts'
import type { PlayerSettings } from './playerSettingsSpec.ts'

export type { SettingsStorage } from './jsonStore.ts'
export { createMemorySettingsStorage } from './jsonStore.ts'

import type { SettingsStorage } from './jsonStore.ts'

export type PlayerSettingsStore = JsonStore<PlayerSettings>

/** Onde as configurações moram. Com prefixo, porque o domínio pode hospedar outra coisa. */
export const PLAYER_SETTINGS_KEY = 'shobu.playerSettings'

/**
 * As configurações do jogador no armazenamento, engolindo qualquer falha
 * (`jsonStore.ts`). Nada guardado, ou guardado sujo, é o padrão da tabela.
 *
 * ```ts
 * const store = createPlayerSettingsStore(window.localStorage)
 * store.write({ ...store.read(), fieldOfViewDeg: 100 })
 * ```
 */
export function createPlayerSettingsStore(storage: SettingsStorage): PlayerSettingsStore {
  return createJsonStore(storage, PLAYER_SETTINGS_KEY, parsePlayerSettings)
}
