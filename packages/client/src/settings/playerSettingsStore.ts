import { parsePlayerSettings } from './parsePlayerSettings.ts'
import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from './playerSettingsSpec.ts'

/**
 * O pedaço de `Storage` que este módulo usa. Estrutural para o teste não
 * precisar de dom, no molde do `KeyEventSource` do `heldKeys.ts`.
 *
 * Nomear `localStorage` aqui dentro seria pior que feio: a tranca de exclusão de
 * cobertura não reconhece `localStorage` como marca de adapter, então um módulo
 * que o nomeasse não poderia sair da conta **nem** ser testado sem navegador.
 * Injetado, ele é 100 % testável — que é o desenho certo de qualquer forma.
 */
export interface SettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface PlayerSettingsStore {
  read(): PlayerSettings
  write(settings: PlayerSettings): void
}

/** Onde as configurações moram. Com prefixo, porque o domínio pode hospedar outra coisa. */
export const PLAYER_SETTINGS_KEY = 'shobu.playerSettings'

/**
 * Leitura e escrita que **engolem qualquer falha**.
 *
 * `localStorage` lança de verdade em três situações que a feira pode produzir:
 * aba anônima do safari, cota estourada, e navegador com cookies de terceiros
 * bloqueados. Nenhuma delas pode derrubar o jogo — o custo de falhar é o jogador
 * perder a preferência dele, e o custo de lançar é o boot inteiro morrer no
 * `announceFailure`.
 *
 * ```ts
 * const store = createPlayerSettingsStore(window.localStorage)
 * store.write({ ...store.read(), fieldOfViewDeg: 100 })
 * ```
 */
export function createPlayerSettingsStore(storage: SettingsStorage): PlayerSettingsStore {
  return {
    read: () => readSettings(storage),
    write: (settings) => writeSettings(storage, settings),
  }
}

function readSettings(storage: SettingsStorage): PlayerSettings {
  const stored = readRaw(storage)
  if (stored === null) return DEFAULT_PLAYER_SETTINGS
  return parsePlayerSettings(parseJson(stored))
}

function readRaw(storage: SettingsStorage): string | null {
  try {
    return storage.getItem(PLAYER_SETTINGS_KEY)
  } catch {
    return null
  }
}

/** Json quebrado é o mesmo caso de campo sujo: vira o padrão, não exceção. */
function parseJson(stored: string): unknown {
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

function writeSettings(storage: SettingsStorage, settings: PlayerSettings): void {
  try {
    storage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // preferência perdida é aborrecimento; boot morto é a demo perdida.
  }
}

/**
 * Armazenamento que só vive nesta aba. É o que o `main.ts` usa quando o próprio
 * **acesso** a `window.localStorage` lança — em alguns navegadores a exceção vem
 * da propriedade, antes de qualquer `getItem`, então nem o `try` de cima
 * alcançaria.
 */
export function createMemorySettingsStorage(): SettingsStorage {
  const entries = new Map<string, string>()
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
  }
}
