import type { ArenaMap } from '../arena/arenaCatalog.ts'
import { createRematchPrompt, type RematchPrompt } from '../hud/rematchPrompt.ts'
import type { MenuAction } from '../menu/mainMenuModel.ts'
import {
  createMemorySettingsStorage,
  type SettingsStorage,
} from '../settings/playerSettingsStore.ts'
import { createRematchStore, pendingRematch, type Rematch, rematchFor } from './rematch.ts'

/**
 * A partida seguinte num outro mapa (`rematch.ts`): o que o boot sabe dela, e
 * como pedir uma. O pedido é lido **uma vez** e apagado — recarregar de novo
 * abre o menu de sempre.
 */
export interface RematchWiring {
  readonly pending: Rematch | null
  readonly prompt: RematchPrompt
  /** Como o jogador entrou na partida de agora: a seguinte sai igual. */
  readonly launched: { action: MenuAction }
  readonly switchTo: (arenaId: string) => void
  /** Recarrega com a partida seguinte esperando o gesto: o CLIQUE PARA ENTRAR. */
  readonly reloadInto: (rematch: Rematch) => void
}

export function takeRematch(arena: ArenaMap): RematchWiring {
  const store = createRematchStore(tabStorage())
  const pending = pendingRematch(store.read(), arena.id)
  store.write(null)
  const launched = { action: 'deploy' as MenuAction }
  return {
    pending,
    prompt: createRematchPrompt(document),
    launched,
    switchTo: (arenaId) => {
      store.write(rematchFor(launched.action, arenaId))
      reloadIntoArena(arenaId)
    },
    reloadInto: (rematch) => {
      store.write(rematch)
      reloadIntoArena(rematch.arenaId)
    },
  }
}

/** O armazenamento da aba: o pedido não pode sobreviver a fechar o jogo. */
function tabStorage(): SettingsStorage {
  try {
    return window.sessionStorage
  } catch {
    return createMemorySettingsStorage()
  }
}

/**
 * A cena sobe um mapa só: trocar é recarregar com o pedido na url, que vence a
 * escolha guardada (`bootArenaIdOf`) e mantém os outros parâmetros (`?perf=1`).
 */
function reloadIntoArena(arenaId: string): void {
  const url = new URL(window.location.href)
  url.searchParams.set('arena', arenaId)
  window.location.assign(url)
}
