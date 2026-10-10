/**
 * A pose da cabeça no cardboard, do `deviceorientation` do celular para a
 * rotação da câmera (ADR 0012). Dado puro: quem escuta o evento e escreve na
 * câmera é `cardboardView.ts`.
 *
 * A conta sai da definição do W3C, e não da `FreeCameraDeviceOrientationInput`
 * do babylon: medida aqui (07/10), aquela entrada espelha o mundo — girar o
 * celular para a esquerda virava a vista para a direita, e o aparelho deitado de
 * tela para cima olhava para o céu. Numa janela mágica isso passa; no óculos é
 * enjoo no primeiro segundo.
 *
 * O W3C dá os eixos do aparelho na terra (leste, norte, cima) por
 * R = Rz(α)·Rx(β)·Ry(γ). Quem olha pelo óculos olha **para dentro** da tela, então
 * a frente da câmera é o -z do aparelho; o "para cima" e o "para a direita" são
 * os do conteúdo, que giram com a orientação da tela. A terra vira o mundo do
 * babylon com leste em x, cima em y e norte em z.
 */

/** Quaternion no formato do babylon: (x, y, z, w). */
export interface HeadQuaternion {
  x: number
  y: number
  z: number
  w: number
}

/** Os ângulos de `camera.rotation`: x é inclinação, y é guinada, z é rolagem (ordem YXZ). */
export interface HeadEuler {
  x: number
  y: number
  z: number
}

/** O que o `deviceorientation` entrega, em graus, e o ângulo da tela. */
export interface DeviceAngles {
  readonly alphaDeg: number
  readonly betaDeg: number
  readonly gammaDeg: number
  /** `screen.orientation.angle`: 90 é paisagem com o topo do aparelho à esquerda. */
  readonly screenDeg: number
}

const DEG = Math.PI / 180

/**
 * A pose da cabeça, sem deslocamento de guinada.
 *
 * ```ts
 * headFromDevice({ alphaDeg: 0, betaDeg: 90, gammaDeg: 0, screenDeg: 0 }, q)
 * // celular em pé, em retrato: olha para o horizonte, ao norte (+z)
 * ```
 */
export function headFromDevice(angles: DeviceAngles, into: HeadQuaternion): HeadQuaternion {
  const [xd, yd, zd] = deviceAxes(
    angles.alphaDeg * DEG,
    angles.betaDeg * DEG,
    angles.gammaDeg * DEG,
  )
  const screen = angles.screenDeg * DEG
  const c = Math.cos(screen)
  const s = Math.sin(screen)
  // o conteúdo gira com a tela: em paisagem (90°), o "para cima" é o +x do aparelho.
  const right = toWorld(combine(xd, c, yd, -s))
  const up = toWorld(combine(yd, c, xd, s))
  const ahead = toWorld(combine(zd, -1, zd, 0))
  return fromBasis(right, up, ahead, into)
}

type Axis3 = readonly [number, number, number]

/** As colunas de Rz(α)·Rx(β)·Ry(γ): os eixos x, y e z do aparelho em (leste, norte, cima). */
function deviceAxes(alpha: number, beta: number, gamma: number): readonly [Axis3, Axis3, Axis3] {
  const ca = Math.cos(alpha)
  const sa = Math.sin(alpha)
  const cb = Math.cos(beta)
  const sb = Math.sin(beta)
  const cg = Math.cos(gamma)
  const sg = Math.sin(gamma)
  return [
    [ca * cg - sa * sb * sg, sa * cg + ca * sb * sg, -cb * sg],
    [-sa * cb, ca * cb, sb],
    [ca * sg + sa * sb * cg, sa * sg - ca * sb * cg, cb * cg],
  ]
}

function combine(a: Axis3, ka: number, b: Axis3, kb: number): Axis3 {
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]
}

/** (leste, norte, cima) para o babylon: x é leste, y é cima, z é norte. */
function toWorld(earth: Axis3): Axis3 {
  return [earth[0], earth[2], earth[1]]
}

/**
 * O quaternion da rotação cujas colunas são direita, cima e frente (o método de
 * Shepperd: parte do maior termo da diagonal, que nunca divide por quase zero).
 */
function fromBasis(right: Axis3, up: Axis3, ahead: Axis3, into: HeadQuaternion): HeadQuaternion {
  const [m00, m10, m20] = right
  const [m01, m11, m21] = up
  const [m02, m12, m22] = ahead
  const trace = m00 + m11 + m22
  if (trace > 0) return setQuaternion(into, m21 - m12, m02 - m20, m10 - m01, trace + 1)
  if (m00 > m11 && m00 > m22)
    return setQuaternion(into, 1 + m00 - m11 - m22, m01 + m10, m02 + m20, m21 - m12)
  if (m11 > m22) return setQuaternion(into, m01 + m10, 1 + m11 - m00 - m22, m12 + m21, m02 - m20)
  return setQuaternion(into, m02 + m20, m12 + m21, 1 + m22 - m00 - m11, m10 - m01)
}

function setQuaternion(
  into: HeadQuaternion,
  x: number,
  y: number,
  z: number,
  w: number,
): HeadQuaternion {
  const length = Math.hypot(x, y, z, w)
  into.x = x / length
  into.y = y / length
  into.z = z / length
  into.w = w / length
  return into
}

/**
 * Gira a pose em torno do eixo vertical do **mundo**: é o deslocamento de
 * guinada. Multiplicar pela esquerda é o que o faz girar o mundo, e não a cabeça.
 */
export function turnHead(yawRad: number, pose: HeadQuaternion): HeadQuaternion {
  const s = Math.sin(yawRad / 2)
  const c = Math.cos(yawRad / 2)
  const { x, y, z, w } = pose
  pose.x = c * x + s * z
  pose.y = c * y + s * w
  pose.z = c * z - s * x
  pose.w = c * w - s * y
  return pose
}

/**
 * Os ângulos de euler (YXZ) de um quaternion, como `toEulerAngles` do babylon.
 * Perto da vertical a rolagem e a guinada se confundem (gimbal lock); ali a
 * rolagem vai a zero e a guinada leva tudo.
 */
export function eulerOf(pose: HeadQuaternion, into: HeadEuler): HeadEuler {
  const { x, y, z, w } = pose
  const zAxisY = y * z - x * w
  if (Math.abs(zAxisY) > 0.4999999) {
    into.y = 2 * Math.atan2(y, w)
    into.x = zAxisY < 0 ? Math.PI / 2 : -Math.PI / 2
    into.z = 0
    return into
  }
  into.z = Math.atan2(2 * (x * y + z * w), -z * z - x * x + y * y + w * w)
  into.x = Math.asin(-2 * zAxisY)
  into.y = Math.atan2(2 * (z * x + y * w), z * z - x * x - y * y + w * w)
  return into
}

/**
 * Quanto girar a pose para que ela olhe na guinada pedida: é o que faz entrar
 * no óculos continuar olhando para onde a câmera já olhava.
 *
 * ```ts
 * const offset = yawOffsetFor(head, camera.rotation.y)
 * turnHead(offset, head) // agora eulerOf(head).y === camera.rotation.y
 * ```
 */
export function yawOffsetFor(head: HeadQuaternion, wantedYawRad: number): number {
  return wantedYawRad - eulerOf(head, { x: 0, y: 0, z: 0 }).y
}
