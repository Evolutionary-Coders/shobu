import type { GamepadSnapshot } from './gamepadInput.ts'

/** Por onde o jogador está jogando agora: é o que escolhe o texto das dicas na tela. */
export type InputMethod = 'keyboard' | 'gamepad' | 'touch'

/**
 * A última entrada usada, e não a do menu: quem entrou pelo teclado e pegou o
 * controle no meio da partida precisa ver a dica do controle. O adapter
 * (`watchInputMethod.ts`) só repassa eventos; a regra de quem vence mora aqui.
 */
export interface InputMethodTracker {
  method: InputMethod
}

/**
 * ```ts
 * const tracker = createInputMethodTracker()
 * tracker.method // 'keyboard'
 * ```
 */
export function createInputMethodTracker(initial: InputMethod = 'keyboard'): InputMethodTracker {
  return { method: initial }
}

/** Uma tecla, um clique ou um giro da roda: teclado e mouse são a mesma entrada. */
export function noteKeyboard(tracker: InputMethodTracker): void {
  tracker.method = 'keyboard'
}

/**
 * Um dedo ou um clique: o `pointerType` diz qual. Caneta conta como mouse — é
 * ponteiro fino, e quem a usa tem teclado.
 *
 * ```ts
 * notePointer(tracker, 'touch') // tracker.method === 'touch'
 * ```
 */
export function notePointer(tracker: InputMethodTracker, pointerType: string): void {
  tracker.method = pointerType === 'touch' ? 'touch' : 'keyboard'
}

/**
 * Abaixo disto o analógico está em repouso. Folgado de propósito: o analógico
 * de um controle largado na mesa deriva uns 10%, e a dica não pode trocar para
 * a do controle enquanto o jogador está no teclado.
 */
export const GAMEPAD_ACTIVE_AXIS = 0.5

/** O controle foi usado neste quadro: um botão apertado ou um analógico empurrado. */
export function isGamepadActive(pad: GamepadSnapshot | undefined): boolean {
  if (!pad) return false
  if (pad.buttons.some((button) => button.pressed)) return true
  return pad.axes.some((axis) => Math.abs(axis) >= GAMEPAD_ACTIVE_AXIS)
}

/**
 * Lido por quadro: só um controle **em uso** toma a vez. Conectado e parado
 * não muda nada, senão o controle esquecido ligado venceria o teclado.
 *
 * ```ts
 * noteGamepad(tracker, navigator.getGamepads()[0] ?? undefined)
 * ```
 */
export function noteGamepad(tracker: InputMethodTracker, pad: GamepadSnapshot | undefined): void {
  if (isGamepadActive(pad)) tracker.method = 'gamepad'
}
