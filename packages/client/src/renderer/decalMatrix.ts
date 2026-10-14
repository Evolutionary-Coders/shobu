import { addScaled, cross, dot, normalizeInPlace, type Vector3 } from '@shobu/core'

/** Dezesseis números por furo no buffer das thin instances. */
export const DECAL_MATRIX_FLOATS = 16

/**
 * Quanto o furo sai da parede, em metros: o bastante para não brigar com ela
 * no depth buffer de longe, pouco para não parecer adesivo de perto.
 */
export const DECAL_LIFT_M = 0.012

/**
 * Escreve no buffer de thin instances a matriz do furo `index`: um quad do
 * plano xy, de lado `sizeM`, deitado na parede de normal `normalM`
 * (unitária), girado `roll` em volta dela e erguido `DECAL_LIFT_M`.
 *
 * As linhas são os eixos em mundo — o x e o y do quad na parede, e o z na
 * normal — e a última é a posição, que é como o babylon lê a matriz.
 *
 * ```ts
 * writeDecalMatrix(buffer, 3, shot.endpointM, normal, slot.roll, 0.14)
 * ```
 */
export function writeDecalMatrix(
  buffer: Float32Array,
  index: number,
  positionM: Readonly<Vector3>,
  normalM: Readonly<Vector3>,
  roll: number,
  sizeM: number,
): void {
  wallTangents(normalM, tangent, bitangent)
  const cos = Math.cos(roll)
  const sin = Math.sin(roll)
  axisX.x = tangent.x * cos + bitangent.x * sin
  axisX.y = tangent.y * cos + bitangent.y * sin
  axisX.z = tangent.z * cos + bitangent.z * sin
  cross(axisY, normalM, axisX)
  const offset = index * DECAL_MATRIX_FLOATS
  writeRow(buffer, offset, axisX, sizeM)
  writeRow(buffer, offset + 4, axisY, sizeM)
  writeRow(buffer, offset + 8, normalM, 1)
  buffer[offset + 12] = positionM.x + normalM.x * DECAL_LIFT_M
  buffer[offset + 13] = positionM.y + normalM.y * DECAL_LIFT_M
  buffer[offset + 14] = positionM.z + normalM.z * DECAL_LIFT_M
  buffer[offset + 15] = 1
}

/** Some com o furo `index`: matriz nula, que a gpu desenha com área zero. */
export function hideDecal(buffer: Float32Array, index: number): void {
  buffer.fill(0, index * DECAL_MATRIX_FLOATS, (index + 1) * DECAL_MATRIX_FLOATS)
}

function writeRow(
  buffer: Float32Array,
  offset: number,
  axis: Readonly<Vector3>,
  scale: number,
): void {
  buffer[offset] = axis.x * scale
  buffer[offset + 1] = axis.y * scale
  buffer[offset + 2] = axis.z * scale
  buffer[offset + 3] = 0
}

/** Dois eixos na parede, perpendiculares à normal e entre si. */
function wallTangents(
  normalM: Readonly<Vector3>,
  outTangent: Vector3,
  outBitangent: Vector3,
): void {
  const floorOrCeiling = Math.abs(normalM.y) > 0.9
  outTangent.x = floorOrCeiling ? 1 : 0
  outTangent.y = floorOrCeiling ? 0 : 1
  outTangent.z = 0
  addScaled(outTangent, normalM, -dot(outTangent, normalM))
  normalizeInPlace(outTangent)
  cross(outBitangent, normalM, outTangent)
}

// rascunho do módulo: um furo por tiro, e nada aloca no caminho do disparo.
const tangent: Vector3 = { x: 0, y: 0, z: 0 }
const bitangent: Vector3 = { x: 0, y: 0, z: 0 }
const axisX: Vector3 = { x: 0, y: 0, z: 0 }
const axisY: Vector3 = { x: 0, y: 0, z: 0 }
