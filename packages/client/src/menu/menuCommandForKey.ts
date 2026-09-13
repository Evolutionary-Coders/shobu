import type { MenuCommand } from './mainMenuModel.ts'

/**
 * Tecla física para comando de menu, no molde do `ACTION_BY_CODE` do
 * `heldKeys.ts` — `KeyboardEvent.code` e não `key`, então wasd continua wasd em
 * teclado azerty ou abnt.
 *
 * WASD entra ao lado das setas porque é onde a mão do jogador de fps já está, e
 * porque o menu e o jogo nunca estão vivos ao mesmo tempo.
 *
 * Espaço ativa junto com Enter: é o hábito de quem vem do navegador e da maior
 * parte dos jogos de pc.
 */
const COMMAND_BY_CODE: Readonly<Record<string, MenuCommand>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Enter: 'activate',
  NumpadEnter: 'activate',
  Space: 'activate',
  Escape: 'back',
  Backspace: 'back',
}

/**
 * ```ts
 * menuCommandForKey('ArrowDown') // 'down'
 * menuCommandForKey('KeyQ')      // undefined
 * ```
 */
export function menuCommandForKey(code: string): MenuCommand | undefined {
  return COMMAND_BY_CODE[code]
}

/**
 * Tecla presa vale para navegar e não para decidir: segurar a direita varrendo o
 * campo de visão de 60 a 120 é o que o jogador espera, mas Enter preso não pode
 * entrar duas vezes e Esc preso não pode voltar dois níveis de uma vez.
 */
export function acceptsRepeat(command: MenuCommand): boolean {
  return command !== 'activate' && command !== 'back'
}
