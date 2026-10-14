import { latchCrouchPress } from './crouchPress.ts'
import {
  type HeldButtons,
  holdButton,
  latchPrimaryPress,
  releaseAllButtons,
} from './heldButtons.ts'
import { type HeldKeys, releaseAll } from './heldKeys.ts'
import type { HeldStick } from './heldStick.ts'

/**
 * Os botões da tela de toque, escritos nos mesmos estados que teclado, mouse e
 * gamepad preenchem: o núcleo não sabe de onde veio o aperto.
 */
export type TouchButton =
  | 'fire'
  | 'scope'
  | 'jump'
  | 'crouch'
  | 'grapple'
  | 'reload'
  | 'melee'
  | 'scoreboard'

export interface TouchTargets {
  readonly keys: HeldKeys
  readonly buttons: HeldButtons
  readonly stick: HeldStick
  /**
   * A lâmina está na mão? Com ela, o botão da lâmina vira o da sniper — o
   * toque não tem tecla 1 nem roda, e segurar de novo ninguém adivinhava.
   * Ausente, o botão é sempre o da lâmina.
   */
  readonly bladeDrawn?: () => boolean
}

/**
 * Um dedo desceu (`pressed`) ou saiu de um botão.
 *
 * Tiro e luneta passam pela trava de aperto (`holdButton`): um toque mais
 * curto que um tick ainda chega ao núcleo. Agachar **alterna**, mas quem
 * alterna é o núcleo (`crouch.ts`), igual para teclado, controle e toque: o
 * botão diz se o dedo está nele, como o pulo, e arma a trava de aperto
 * (`crouchPress.ts`) — o núcleo alterna na borda, e o toque curto entre dois
 * ticks não teria borda. Antes o toque alternava a tecla aqui, e com o núcleo
 * alternando também, cada toque contaria duas vezes (12/10). O gancho é **segurar**, como no teclado: soltar no ponto certo do balanço é a
 * mecânica, e um alternador obrigaria a dois toques para soltar. O corpo a
 * corpo é **segurar** também: toque curto golpeia, segurar empunha a lâmina.
 * Com a lâmina já na mão, o mesmo botão **volta à sniper** no toque: golpear
 * é o botão de tiro, e voltar não tinha caminho nenhum (11/10).
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
  if (button === 'crouch' && pressed) latchCrouchPress(targets.buttons)
  if (button === 'melee' && pressed && targets.bladeDrawn?.()) {
    latchPrimaryPress(targets.buttons)
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
