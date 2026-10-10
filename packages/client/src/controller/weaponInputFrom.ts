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
  buttons: Readonly<HeldButtons>,
  into: MutableWeaponInput,
): MutableWeaponInput {
  // a trava só é **olhada** aqui, e não consumida: quem consome é
  // `settleWeaponPresses`, depois de um tick ter de fato lido a entrada.
  into.fire = buttons.fire || buttons.firePressedUnread
  into.scope = buttons.scope || buttons.scopePressedUnread
  into.reload = keys.reload
  return into
}

/**
 * Consome as travas de aperto **depois** de um quadro que rodou ao menos um
 * tick, e só as que **estavam na entrada** que esses ticks leram: só aí o
 * aperto chegou ao núcleo. O aperto que chegou entre a entrada e o tick fica
 * para o próximo — o avanço da simulação roda antes de a entrada do quadro
 * ser montada.
 *
 * O quadro e o tick andam em ritmos diferentes — a 144 Hz, mais da metade dos
 * quadros não roda tick nenhum. Consumir a trava ao montar a entrada, como
 * era, jogava fora o clique curto que caísse num quadro sem tick: a entrada
 * era sobrescrita no quadro seguinte antes de algum tick lê-la, e o tiro do
 * mouse não saía (validação da `dev`, 10/10).
 *
 * ```ts
 * const ticks = session.advance(frame)
 * if (ticks > 0) settleWeaponPresses(buttons, weaponInput)
 * ```
 */
export function settleWeaponPresses(buttons: HeldButtons, read: Readonly<WeaponInput>): void {
  if (read.fire) takePress(buttons, 'fire')
  if (read.scope) takePress(buttons, 'scope')
}
