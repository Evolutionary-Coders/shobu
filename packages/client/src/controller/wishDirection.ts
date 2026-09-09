import type { MovementInput } from '@shobu/core'
import type { HeldKeys } from './heldKeys.ts'

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
  return { wishX: 0, wishZ: 0, sprint: false, jump: false, crouch: false }
}

/**
 * Wasd vira dois eixos (frente/trás, direita/esquerda) que se somam na base
 * da câmera e são normalizados: diagonal não anda mais rápido que reto.
 *
 * ```ts
 * wishFromKeys(keys, basis, input) // input.wishX / wishZ preenchidos
 * ```
 */
export function wishFromKeys(
  keys: HeldKeys,
  basis: PlanarBasis,
  into: MutableMovementInput,
): MutableMovementInput {
  const ahead = axis(keys.forward, keys.back)
  const side = axis(keys.right, keys.left)
  const wishX = ahead * basis.forwardX + side * basis.rightX
  const wishZ = ahead * basis.forwardZ + side * basis.rightZ
  const length = Math.sqrt(wishX * wishX + wishZ * wishZ)
  into.wishX = length > 1 ? wishX / length : wishX
  into.wishZ = length > 1 ? wishZ / length : wishZ
  into.sprint = keys.sprint
  into.jump = keys.jump
  into.crouch = keys.crouch
  return into
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
