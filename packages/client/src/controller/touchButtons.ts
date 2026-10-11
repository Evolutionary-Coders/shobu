import { type HeldButtons, holdButton, releaseAllButtons } from './heldButtons.ts'
import { type HeldKeys, releaseAll } from './heldKeys.ts'
import type { HeldStick } from './heldStick.ts'

/**
 * Os botões da tela de toque, escritos nos mesmos estados que teclado, mouse e
 * gamepad preenchem: o núcleo não sabe de onde veio o aperto.
 */
export type TouchButton = 'fire' | 'scope' | 'jump' | 'crouch' | 'reload'

export interface TouchTargets {
  readonly keys: HeldKeys
  readonly buttons: HeldButtons
  readonly stick: HeldStick
}

/**
 * Um dedo desceu (`pressed`) ou saiu de um botão.
 *
 * Tiro e luneta passam pela trava de aperto (`holdButton`): um toque mais
 * curto que um tick ainda chega ao núcleo. Agachar **alterna**: segurar um
 * botão com o polegar que também anda é o que nenhum fps de celular pede.
 *
 * ```ts
 * pressTouchButton('fire', true, targets)
 * ```
 */
export function pressTouchButton(
  button: TouchButton,
  pressed: boolean,
  targets: TouchTargets,
): void {
  if (button === 'fire' || button === 'scope') {
    holdButton(targets.buttons, button, pressed)
    return
  }
  if (button === 'crouch') {
    if (pressed) targets.keys.crouch = !targets.keys.crouch
    return
  }
  targets.keys[button] = pressed
}

/**
 * Solta tudo o que o toque segurava: a pausa ou o fim da sessão. Personagem
 * que continua agachado ou atirando depois de o jogador sair é o defeito que
 * se vê primeiro ao voltar.
 */
export function releaseTouchTargets(targets: TouchTargets): void {
  releaseAll(targets.keys)
  releaseAllButtons(targets.buttons)
  targets.stick.ahead = 0
  targets.stick.side = 0
}
