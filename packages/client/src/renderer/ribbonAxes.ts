import { addScaled, cross, dot, lengthSquared, normalizeInPlace, type Vector3 } from '@shobu/core'

/**
 * Os três eixos de uma fita que vai de `from` a `to` e **vira a face para o
 * olho**: `along` é a direção do feixe, `facing` aponta para o olho, e `side`
 * é a largura da fita. É o que troca o cilindro do rastro por um plano — um
 * plano não tem lado de que pareça tubo, e o gradiente da textura fica
 * sempre de frente.
 */
export interface RibbonAxes {
  readonly side: Vector3
  readonly facing: Vector3
  readonly along: Vector3
}

export function createRibbonAxes(): RibbonAxes {
  return {
    side: { x: 1, y: 0, z: 0 },
    facing: { x: 0, y: 1, z: 0 },
    along: { x: 0, y: 0, z: 1 },
  }
}

/** Abaixo disto o olho está em cima da linha, e a face vira para qualquer perpendicular. */
const DEGENERATE_SQUARED_M = 1e-8

/**
 * Escreve os eixos em `out` e devolve o comprimento do feixe, em metros.
 *
 * A face aponta para o **ponto do feixe mais perto do olho**, e não para o
 * meio dele: o tiro do bot que passa raspando gira para quem está do lado, e
 * o do próprio jogador, que começa no cano, gira para o olho logo atrás do
 * cano. Os eixos são de mão esquerda, como os do babylon: `side = facing ×
 * along`.
 *
 * ```ts
 * const lengthM = ribbonAxes(muzzle, impact, eye, axes)
 * ```
 */
export function ribbonAxes(
  fromM: Readonly<Vector3>,
  toM: Readonly<Vector3>,
  eyeM: Readonly<Vector3>,
  out: RibbonAxes,
): number {
  const { along, facing, side } = out
  along.x = toM.x - fromM.x
  along.y = toM.y - fromM.y
  along.z = toM.z - fromM.z
  const lengthM = Math.sqrt(lengthSquared(along))
  if (lengthM < 1e-6) along.z = 1
  normalizeInPlace(along)
  facing.x = eyeM.x - fromM.x
  facing.y = eyeM.y - fromM.y
  facing.z = eyeM.z - fromM.z
  // tirar a componente ao longo do feixe é o mesmo que mirar no ponto mais
  // perto do olho: o que sobra é perpendicular, e aponta para ele.
  addScaled(facing, along, -dot(facing, along))
  if (lengthSquared(facing) < DEGENERATE_SQUARED_M) anyPerpendicular(along, facing)
  normalizeInPlace(facing)
  normalizeInPlace(cross(side, facing, along))
  return lengthM
}

/** Uma perpendicular qualquer a `along`: o cima do mundo, ou o x se o feixe for vertical. */
function anyPerpendicular(along: Readonly<Vector3>, out: Vector3): void {
  const vertical = Math.abs(along.y) > 0.9
  out.x = vertical ? 1 : 0
  out.y = vertical ? 0 : 1
  out.z = 0
  addScaled(out, along, -dot(out, along))
}
