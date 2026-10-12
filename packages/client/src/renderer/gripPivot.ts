import type { RigPose } from './rigPose.ts'

/**
 * A pose da mão girada **em volta da empunhadura**, e não da origem do glb.
 *
 * A origem do glb da sniper fica no meio da arma, 17 cm à frente da mão e a
 * meio metro da soleira da coronha. Girar o rig ali, com os ângulos somados aos
 * do ajuste, fazia a corrida tática erguer a coronha para dentro do olho: a
 * arma virava um borrão preto cobrindo o terço de baixo da tela (captura de
 * 11/10). Uma pose de corrida é a mão levando a arma, então o pivô é a mão.
 *
 * As contas são as do babylon — mesma ordem de giro do `rotation` (guinada,
 * inclinação, rolagem) e o mesmo quaternion `(x, y, z, w)` —, em código puro
 * para o teste rodar sem engine; o teste compara com o próprio babylon.
 */

export interface RigVector {
  x: number
  y: number
  z: number
}

/** No formato do babylon: `(x, y, z, w)`. */
export interface RigQuaternion {
  x: number
  y: number
  z: number
  w: number
}

/** Onde o rig fica na câmera: posição em metros e giro. Mutável e reaproveitado. */
export interface RigTransform {
  readonly position: RigVector
  readonly rotation: RigQuaternion
}

export function createRigTransform(): RigTransform {
  return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }
}

/**
 * O quaternion de `node.rotation = (pitch, yaw, roll)`, igual ao
 * `Quaternion.RotationYawPitchRoll` do babylon.
 *
 * ```ts
 * yawPitchRollQuaternion(0, Math.PI / 2, 0, q) // cano para baixo
 * ```
 */
export function yawPitchRollQuaternion(
  yawRad: number,
  pitchRad: number,
  rollRad: number,
  out: RigQuaternion,
): RigQuaternion {
  const sy = Math.sin(yawRad / 2)
  const cy = Math.cos(yawRad / 2)
  const sp = Math.sin(pitchRad / 2)
  const cp = Math.cos(pitchRad / 2)
  const sr = Math.sin(rollRad / 2)
  const cr = Math.cos(rollRad / 2)
  out.x = cy * sp * cr + sy * cp * sr
  out.y = sy * cp * cr - cy * sp * sr
  out.z = cy * cp * sr - sy * sp * cr
  out.w = cy * cp * cr + sy * sp * sr
  return out
}

/**
 * `a ⊗ b`: gira por `b` e depois por `a`. `out` pode ser `a` ou `b`.
 *
 * ```ts
 * multiplyQuaternions(pose, placement, rig) // a pose por cima do ajuste
 * ```
 */
export function multiplyQuaternions(
  a: Readonly<RigQuaternion>,
  b: Readonly<RigQuaternion>,
  out: RigQuaternion,
): RigQuaternion {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  out.x = x
  out.y = y
  out.z = z
  out.w = w
  return out
}

/**
 * `v` girado por `q`. `out` pode ser `v`.
 *
 * ```ts
 * rotateVector(rig.rotation, GRIP, grip)
 * ```
 */
export function rotateVector(
  q: Readonly<RigQuaternion>,
  v: Readonly<RigVector>,
  out: RigVector,
): RigVector {
  // t = 2·(q × v); v' = v + w·t + q × t
  const tx = 2 * (q.y * v.z - q.z * v.y)
  const ty = 2 * (q.z * v.x - q.x * v.z)
  const tz = 2 * (q.x * v.y - q.y * v.x)
  const x = v.x + q.w * tx + (q.y * tz - q.z * ty)
  const y = v.y + q.w * ty + (q.z * tx - q.x * tz)
  const z = v.z + q.w * tz + (q.x * ty - q.y * tx)
  out.x = x
  out.y = y
  out.z = z
  return out
}

/**
 * O giro de uma pose, nos eixos da câmera e nesta ordem: deitar a arma em
 * volta do cano (`cantRad`, que no descanso aponta para a frente), apontar o
 * cano para cima ou para baixo (`pitchRad`) e para o lado (`yawRad`), como se
 * aponta uma câmera, e por último incliná-la **no plano da tela**
 * (`rollRad`). É a ordem em que se descreve uma pose olhando a tela —
 * "deitada, o cano para baixo e para a esquerda" —; a do `rotation` do
 * babylon é a mesma menos o último passo, e sem ele não há como inclinar a
 * arma na tela.
 *
 * ```ts
 * cameraTurnQuaternion(rigPose({ pitchRad: -1.3, rollRad: 0.2 }), q) // quase em pé, para a esquerda
 * ```
 */
export function cameraTurnQuaternion(pose: Readonly<RigPose>, out: RigQuaternion): RigQuaternion {
  yawPitchRollQuaternion(pose.yawRad, pose.pitchRad, pose.cantRad, out)
  return multiplyQuaternions(yawPitchRollQuaternion(0, 0, pose.rollRad, screenLean), out, out)
}

const screenLean: RigQuaternion = { x: 0, y: 0, z: 0, w: 1 }
const poseTurn: RigQuaternion = { x: 0, y: 0, z: 0, w: 1 }
const grip: RigVector = { x: 0, y: 0, z: 0 }
const turnedGrip: RigVector = { x: 0, y: 0, z: 0 }

/**
 * Põe `pose` por cima de `rig`, girando em volta de `gripM` (no espaço do
 * glb): a mão vai para onde a pose manda — o deslocamento dela, em metros da
 * câmera — e a arma gira **em volta da mão**, nos eixos da câmera
 * (`cameraTurnQuaternion`). Inclinação positiva baixa o cano, guinada
 * positiva o leva para a direita, rolagem positiva deita a arma para a
 * esquerda.
 *
 * Os ângulos da pose **não** somam com os do ajuste: o giro dela compõe por
 * cima, e é isso que deixa duas poses misturadas lerem como um meio-termo.
 *
 * ```ts
 * poseAboutGrip(rig, SNIPER_GAIT.tactical, SNIPER_GRIP_M)
 * ```
 */
export function poseAboutGrip(
  rig: RigTransform,
  pose: Readonly<RigPose>,
  gripM: Readonly<RigVector>,
): RigTransform {
  const { position, rotation } = rig
  rotateVector(rotation, gripM, grip)
  grip.x += position.x
  grip.y += position.y
  grip.z += position.z
  cameraTurnQuaternion(pose, poseTurn)
  multiplyQuaternions(poseTurn, rotation, rotation)
  rotateVector(rotation, gripM, turnedGrip)
  position.x = grip.x + pose.x - turnedGrip.x
  position.y = grip.y + pose.y - turnedGrip.y
  position.z = grip.z + pose.z - turnedGrip.z
  return rig
}
