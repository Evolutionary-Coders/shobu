import type { WeaponInput } from '@shobu/core'
import type { HeldButtons } from './heldButtons.ts'
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
  buttons: Readonly<HeldButtons>,
  into: MutableWeaponInput,
): MutableWeaponInput {
  into.fire = buttons.fire
  into.scope = buttons.scope
  into.reload = keys.reload
  return into
}
