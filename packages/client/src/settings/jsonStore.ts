/**
 * O pedaço de `Storage` que os stores usam. Estrutural para o teste não
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

/** Uma preferência guardada como json numa chave do armazenamento. */
export interface JsonStore<Value> {
  read(): Value
  write(value: Value): void
}

/**
 * Leitura e escrita que **engolem qualquer falha**.
 *
 * `localStorage` lança de verdade em três situações que a feira pode produzir:
 * aba anônima do safari, cota estourada, e navegador com cookies de terceiros
 * bloqueados. Nenhuma delas pode derrubar o jogo — o custo de falhar é o jogador
 * perder a preferência dele, e o custo de lançar é o boot inteiro morrer no
 * `announceFailure`.
 *
 * Quem dá forma ao json é `parse`, que nunca lança e recebe `null` quando não
 * há nada guardado ou o guardado está quebrado.
 *
 * ```ts
 * const store = createJsonStore(window.localStorage, 'shobu.classLoadout', parseClassLoadout)
 * store.write({ ...store.read(), melee: 1 })
 * ```
 */
export function createJsonStore<Value>(
  storage: SettingsStorage,
  key: string,
  parse: (raw: unknown) => Value,
): JsonStore<Value> {
  return {
    read: () => parse(parseJson(readRaw(storage, key))),
    write: (value) => writeRaw(storage, key, value),
  }
}

function readRaw(storage: SettingsStorage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

/** Json quebrado é o mesmo caso de campo sujo: vira o padrão, não exceção. */
function parseJson(stored: string | null): unknown {
  if (stored === null) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

function writeRaw(storage: SettingsStorage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value))
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
