import type { MenuAction } from './mainMenuModel.ts'

/** De onde veio o comando do menu. O mouse entra pelo teclado: os dois travam o ponteiro. */
export type MenuSource = 'keyboard' | 'gamepad'

/**
 * Como o jogador entra na arena: pelo óculos, pelo controle ou com o ponteiro
 * travado.
 */
export type ArenaEntry = 'headset' | 'gamepad' | 'pointer'

/**
 * O óculos é escolha explícita do item VR EXPERIMENTAL. Fora dele, quem
 * confirmou pelo controle joga pelo controle: o navegador não trava o
 * ponteiro num aperto de gamepad (`gamepadSession.ts`), e pedir um clique de
 * mouse a quem está de controle na mão é o que este módulo evita.
 *
 * ```ts
 * arenaEntryFor('deploy', 'gamepad') // 'gamepad'
 * ```
 */
export function arenaEntryFor(action: MenuAction, source: MenuSource): ArenaEntry {
  if (action === 'deploy-headset') return 'headset'
  return source === 'gamepad' ? 'gamepad' : 'pointer'
}
