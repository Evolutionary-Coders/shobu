import type { MenuAction } from '../menu/mainMenuModel.ts'
import { createJsonStore, type JsonStore, type SettingsStorage } from '../settings/jsonStore.ts'

/**
 * A partida seguinte num **outro** mapa atravessa um recarregamento de página:
 * a cena sobe um mapa só (`bootArenaIdOf`). O que precisa atravessar é pouco —
 * o mapa que o voto escolheu e como o jogador tinha entrado, que é o que dá as
 * mesmas regras (`matchLaunchOf`) —, e vai no armazenamento da aba, lido uma
 * vez no boot e apagado.
 *
 * O ponteiro travado exige um gesto depois do recarregamento: o boot mostra
 * CLIQUE PARA ENTRAR, e o primeiro gesto entra direto na partida, sem menu.
 */
export type RematchAction = Extract<
  MenuAction,
  'deploy' | 'deploy-match' | 'deploy-headset' | 'train'
>

export interface Rematch {
  readonly arenaId: string
  /** Como o jogador entrou na partida que acabou: dá as mesmas regras. */
  readonly action: RematchAction
}

// o treino entra aqui pela troca de skin (`sceneReloadOf`): ele não acaba no
// relógio, então nunca chega ao voto, mas a skin nova também recarrega.
const REMATCH_ACTIONS: readonly string[] = ['deploy', 'deploy-match', 'deploy-headset', 'train']

/** Onde a partida seguinte espera o recarregamento. Na aba, não no navegador. */
export const REMATCH_KEY = 'shobu.rematch'

/**
 * O pedido guardado, ou `null` — inclusive quando o que estava lá não é um
 * pedido válido: armazenamento é entrada de fora.
 *
 * ```ts
 * parseRematch({ arenaId: 'ichiban-gai', action: 'deploy' }) // o mesmo pedido
 * ```
 */
export function parseRematch(raw: unknown): Rematch | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { arenaId, action } = raw as Record<string, unknown>
  if (typeof arenaId !== 'string' || typeof action !== 'string') return null
  if (!REMATCH_ACTIONS.includes(action)) return null
  return { arenaId, action: action as RematchAction }
}

/**
 * O pedido para a partida seguinte, a partir de como o jogador entrou. Os
 * comandos que não entram na arena não têm partida seguinte: sem pedido, o
 * boot abre o menu como sempre.
 *
 * ```ts
 * rematchFor('deploy-match', 'ichiban-gai') // { arenaId: 'ichiban-gai', action: 'deploy-match' }
 * ```
 */
export function rematchFor(action: MenuAction, arenaId: string): Rematch | null {
  return parseRematch({ arenaId, action })
}

/**
 * O pedido vale só para o mapa que a página de fato subiu: um pedido velho, de
 * outro caminho, não pode pular o menu num mapa que ninguém votou.
 */
export function pendingRematch(stored: Rematch | null, loadedArenaId: string): Rematch | null {
  return stored?.arenaId === loadedArenaId ? stored : null
}

export function createRematchStore(storage: SettingsStorage): JsonStore<Rematch | null> {
  return createJsonStore(storage, REMATCH_KEY, parseRematch)
}
