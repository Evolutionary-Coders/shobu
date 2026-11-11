import type { MenuSource } from './arenaEntry.ts'
import type { MenuCommand, MenuScreen } from './mainMenuModel.ts'

/**
 * Se o comando do menu tira da tela cheia: só o ESC (ou o backspace) do
 * teclado na raiz, onde "voltar" não tem para onde ir. Nas outras telas ele
 * volta à raiz. O B do controle não sai: sem um clique ou uma tecla, quem joga
 * só de controle não teria como voltar à tela cheia, porque o navegador não a
 * concede a um botão de gamepad (`keepFullscreenOnGesture`).
 *
 * ```ts
 * menuLeavesFullscreen('back', 'root', 'keyboard') // true
 * ```
 */
export function menuLeavesFullscreen(
  command: MenuCommand,
  screen: MenuScreen,
  source: MenuSource,
): boolean {
  return command === 'back' && screen === 'root' && source === 'keyboard'
}
