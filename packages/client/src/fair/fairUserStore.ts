import { fairUserIdOf } from '@shobu/core'
import { createJsonStore, type SettingsStorage } from '../settings/jsonStore.ts'

/** Onde a aba guarda o ID da Feira. */
export const FAIR_USER_KEY = 'shobu.fairUser'

/**
 * O ID da Feira que esta aba escolheu (ADR 0037): o número, `null` para quem
 * escolheu jogar sem ID, ou `undefined` antes de escolher, que é quando o
 * modal abre.
 */
export interface FairUserStore {
  read(): number | null | undefined
  write(userId: number | null): void
}

/**
 * Guardado no armazenamento da **aba** (`tabStorage`): atravessa a recarga da
 * troca de mapa, sem pedir o ID de novo a cada partida, e morre com a aba.
 * Quem decide quando o guardado vale é `linkFairCredit`.
 *
 * ```ts
 * const store = createFairUserStore(tabStorage())
 * if (store.read() === undefined) modal.open(null)
 * ```
 */
export function createFairUserStore(storage: SettingsStorage): FairUserStore {
  const json = createJsonStore<{ readonly userId: number | null } | undefined>(
    storage,
    FAIR_USER_KEY,
    parseFairUserChoice,
  )
  return {
    read: () => json.read()?.userId,
    write: (userId) => json.write({ userId }),
  }
}

/** Dentro de um objeto, para o `null` de "sem ID" não se confundir com "nada guardado". */
function parseFairUserChoice(raw: unknown): { readonly userId: number | null } | undefined {
  if (typeof raw !== 'object' || raw === null || !('userId' in raw)) return undefined
  if (raw.userId === null) return { userId: null }
  const userId = fairUserIdOf(raw.userId)
  return userId === undefined ? undefined : { userId }
}
