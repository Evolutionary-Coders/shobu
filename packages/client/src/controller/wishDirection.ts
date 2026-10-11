import type { MovementInput } from '@shobu/core'
import type { HeldKeys } from './heldKeys.ts'
import type { HeldStick } from './heldStick.ts'

/**
 * Do teclado e da câmera para a entrada do núcleo. A trigonometria da câmera
 * fica **aqui**, do lado do cliente: o núcleo recebe a direção pronta em
 * espaço de mundo, porque seno e cosseno não são determinísticos entre
 * plataformas e o servidor tem que reproduzir o mesmo vetor (ADR 0003).
 */

/** Frente e direita da câmera projetadas no plano do chão, unitárias. */
export interface PlanarBasis {
  readonly forwardX: number
  readonly forwardZ: number
  readonly rightX: number
  readonly rightZ: number
}

/** A entrada que o cliente preenche por quadro e reaproveita — sem alocar. */
export type MutableMovementInput = { -readonly [Key in keyof MovementInput]: MovementInput[Key] }

export function createMovementInput(): MutableMovementInput {
  return {
    wishX: 0,
    wishZ: 0,
    sprint: false,
    jump: false,
    crouch: false,
    scoped: false,
    grapple: false,
    aimX: 0,
    aimY: 0,
    aimZ: 0,
  }
}

/** O analógico solto: quem não tem gamepad passa este e anda só pelo teclado. */
export const STICK_AT_REST: Readonly<HeldStick> = Object.freeze({ ahead: 0, side: 0 })

/**
 * Wasd vira dois eixos (frente/trás, direita/esquerda), o analógico soma os
 * dele, e tudo se compõe na base da câmera. Normaliza só acima de 1: diagonal
 * não anda mais rápido que reto, e meio curso do analógico continua devagar.
 *
 * ```ts
 * wishFromKeys(keys, basis, input)        // input.wishX / wishZ preenchidos
 * wishFromKeys(keys, basis, input, stick) // teclado e analógico juntos
 * ```
 */
export function wishFromKeys(
  keys: HeldKeys,
  basis: PlanarBasis,
  into: MutableMovementInput,
  stick: Readonly<HeldStick> = STICK_AT_REST,
): MutableMovementInput {
  const ahead = clampAxis(axis(keys.forward, keys.back) + stick.ahead)
  const side = clampAxis(axis(keys.right, keys.left) + stick.side)
  const wishX = ahead * basis.forwardX + side * basis.rightX
  const wishZ = ahead * basis.forwardZ + side * basis.rightZ
  const length = Math.sqrt(wishX * wishX + wishZ * wishZ)
  into.wishX = length > 1 ? wishX / length : wishX
  into.wishZ = length > 1 ? wishZ / length : wishZ
  into.sprint = keys.sprint
  into.jump = keys.jump
  into.crouch = keys.crouch
  into.grapple = keys.grapple
  return into
}

/** Tecla e analógico no mesmo sentido não somam além do curso inteiro. */
function clampAxis(value: number): number {
  return Math.max(-1, Math.min(1, value))
}

/** Duas teclas opostas presas se anulam: é o comportamento de todo fps. */
function axis(positive: boolean, negative: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0)
}

/**
 * Projeta um vetor de direção da câmera no plano do chão. Olhar para cima ou
 * para baixo não pode encurtar o passo, então o resultado é unitário — a menos
 * que a câmera aponte reto para o chão, quando não há frente e sobra zero.
 *
 * ```ts
 * planarUnit(0, -0.7, 0.7) // [0, 1]
 * ```
 */
export function planarUnit(x: number, _y: number, z: number): readonly [number, number] {
  const length = Math.sqrt(x * x + z * z)
  if (length < 1e-6) return [0, 0]
  return [x / length, z / length]
}
