import { createJsonStore, type SettingsStorage } from './jsonStore.ts'

/** A chave da marca, no armazenamento da aba. */
export const GAME_RELOAD_KEY = 'shobu.gameReload'

/**
 * A marca de que a próxima carga da página foi pedida pelo próprio jogo (a
 * troca de mapa, o convite, a sala que mudou de mapa), e não aberta pela
 * pessoa. Toda recarga do jogo passa por `reloadIntoArena`, que a marca; o
 * boot a lê **uma vez** e a apaga. É por ela que o ID da Feira atravessa a
 * recarga sem perguntar de novo (ADR 0037, review do PR #49).
 *
 * ```ts
 * markGameReload(tabStorage()) // antes do location.assign
 * takeGameReload(tabStorage()) // true no boot seguinte, false depois
 * ```
 */
export function markGameReload(storage: SettingsStorage): void {
  createJsonStore(storage, GAME_RELOAD_KEY, Boolean).write(true)
}

export function takeGameReload(storage: SettingsStorage): boolean {
  const mark = createJsonStore(storage, GAME_RELOAD_KEY, (raw) => raw === true)
  const marked = mark.read()
  mark.write(false)
  return marked
}
