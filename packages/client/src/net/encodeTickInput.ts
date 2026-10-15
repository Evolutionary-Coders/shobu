import {
  encodeButtons,
  type MovementInput,
  quantizeAim,
  quantizeWish,
  type Vector3,
  type WeaponInput,
  type WireButtons,
  type WireInput,
} from '@shobu/core'

/** O input de fio que o cliente preenche por tick e reaproveita, sem alocar. */
export type MutableWireInput = { -readonly [Key in keyof WireInput]: WireInput[Key] }

/**
 * Rascunho dos botões, reaproveitado: montar um objeto por tick seria alocação
 * no caminho quente. A função é síncrona, então dividir o rascunho é seguro.
 */
const buttonsScratch: { -readonly [Key in keyof WireButtons]: boolean } = {
  sprint: false,
  jump: false,
  crouch: false,
  grapple: false,
  fire: false,
  scope: false,
  aim: false,
  reload: false,
  melee: false,
  primary: false,
}

export function createWireInput(): MutableWireInput {
  return { wishX: 0, wishZ: 0, buttons: 0, aimX: 0, aimY: 0, aimZ: -32767 }
}

/**
 * O input de um tick, do jeito que a predição acabou de usá-lo, no formato de
 * fio do núcleo. Roda 60 vezes por segundo, então escreve em `out`.
 *
 * ```ts
 * encodeTickInput(movementInput, weaponInput, frame.aimM, wireInput)
 * ```
 */
export function encodeTickInput(
  movement: Readonly<MovementInput>,
  weapon: Readonly<WeaponInput>,
  aimM: Readonly<Vector3>,
  out: MutableWireInput,
): MutableWireInput {
  out.wishX = quantizeWish(movement.wishX)
  out.wishZ = quantizeWish(movement.wishZ)
  buttonsScratch.sprint = movement.sprint
  buttonsScratch.jump = movement.jump
  buttonsScratch.crouch = movement.crouch
  buttonsScratch.grapple = movement.grapple
  buttonsScratch.fire = weapon.fire
  buttonsScratch.scope = weapon.scope
  buttonsScratch.aim = weapon.aim
  buttonsScratch.reload = weapon.reload
  buttonsScratch.melee = weapon.melee
  buttonsScratch.primary = weapon.primary
  out.buttons = encodeButtons(buttonsScratch)
  return quantizeAim(aimM, out)
}
