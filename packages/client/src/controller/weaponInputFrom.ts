import type { WeaponInput } from '@shobu/core'
import { type HeldButtons, takePress } from './heldButtons.ts'
import type { HeldKeys } from './heldKeys.ts'

/** A entrada da arma que o cliente preenche por quadro e reaproveita — sem alocar. */
export type MutableWeaponInput = { -readonly [Key in keyof WeaponInput]: WeaponInput[Key] }

export function createWeaponInput(): MutableWeaponInput {
  return { fire: false, scope: false, reload: false }
}

/**
 * Junta teclado e mouse na entrada que o núcleo consome. Tiro e mira são
 * botão, recarga é tecla, e o núcleo não precisa saber de qual dispositivo
 * cada um veio.
 *
 * ```ts
 * weaponInputFrom(keys, buttons, input)
 * ```
 */
export function weaponInputFrom(
  keys: Readonly<HeldKeys>,
  buttons: HeldButtons,
  into: MutableWeaponInput,
): MutableWeaponInput {
  // `takePress` consome a trava: um clique curto demais para estar preso em
  // algum tick ainda chega ao núcleo, por exatamente um tick.
  into.fire = buttons.fire || takePress(buttons, 'fire')
  into.scope = buttons.scope || takePress(buttons, 'scope')
  into.reload = keys.reload
  return into
}
