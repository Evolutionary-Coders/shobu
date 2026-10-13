import type { HeldButtons } from './heldButtons.ts'

/**
 * Agachar no toque como **aperto**, com a mesma trava do tiro e da luneta.
 *
 * Quem alterna é o núcleo (`crouch.ts`), na borda de subida de
 * `MovementInput.crouch`. O botão de toque só espelhava o dedo, e um toque
 * que desce e sobe **entre duas amostras** da simulação nunca aparecia preso
 * em nenhuma: o núcleo não via borda e o agachar sumia. Com a trava, o toque
 * fica preso até um tick o ler.
 *
 * ```ts
 * latchCrouchPress(buttons) // crouchRequested(false, buttons) → true, até o settle
 * ```
 */
export function latchCrouchPress(buttons: HeldButtons): void {
  buttons.crouchPressedUnread = true
}

/**
 * O agachar que a entrada do quadro leva ao núcleo: a tecla presa, ou um
 * toque que nenhum tick leu ainda. Só **olha** a trava; quem a consome é
 * `settleCrouchPress`, depois de um tick ter lido a entrada.
 *
 * ```ts
 * input.crouch = crouchRequested(keys.crouch, buttons)
 * ```
 */
export function crouchRequested(keyHeld: boolean, buttons: Readonly<HeldButtons>): boolean {
  return keyHeld || buttons.crouchPressedUnread
}

/**
 * Consome a trava depois de um quadro que rodou ao menos um tick com ela na
 * entrada — o mesmo contrato de `settleWeaponPresses`.
 *
 * ```ts
 * if (ticks > 0) settleCrouchPress(buttons, movementInput)
 * ```
 */
export function settleCrouchPress(buttons: HeldButtons, read: Readonly<{ crouch: boolean }>): void {
  if (read.crouch) buttons.crouchPressedUnread = false
}
