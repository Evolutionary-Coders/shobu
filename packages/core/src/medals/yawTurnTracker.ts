import type { Vector3 } from '../math/vector3.ts'

/**
 * Quanto o atirador girou nos últimos segundos, no plano do chão — é o
 * `360-no-scope`. O yaw segue fora do estado de rede (ADR 0003), mas a mira
 * já chega em todo input, e a volta sai dela: cada amostra é a diferença de
 * rumo para a anterior, e a soma da janela é o giro.
 *
 * A soma é **com sinal**, e o giro é o módulo dela: balançar o mouse de um
 * lado para o outro soma zero e não compra a medalha.
 *
 * O rumo é o "ângulo de losango" (0 a 4 numa volta, só divisão), e não
 * `Math.atan2`, que o núcleo proíbe (`coreIsDeterministic`): o último bit dele
 * não é fixo entre motores, e a medalha vale pontos. A escala é a do ângulo
 * só nos quartos de volta; uma volta inteira vale **exatamente** 360, de
 * qualquer rumo de partida, que é o limiar que importa.
 *
 * ```ts
 * const spin = createYawTurnTracker(121)
 * noteYaw(spin, matchTimeS, aimM)
 * yawTurnWithin(spin, matchTimeS, config.medals.spinWindowS) // 362.5
 * ```
 */
export interface YawTurnTracker {
  readonly atS: Float64Array
  readonly turnDeg: Float64Array
  next: number
  /** O rumo da amostra anterior, de 0 a 4; `NaN` antes da primeira. */
  heading: number
}

const DEGREES_PER_QUARTER = 90

/** Um anel de `capacity` amostras: cubra a janela inteira no tick da sala. */
export function createYawTurnTracker(capacity: number): YawTurnTracker {
  return {
    atS: new Float64Array(capacity).fill(Number.NEGATIVE_INFINITY),
    turnDeg: new Float64Array(capacity),
    next: 0,
    heading: Number.NaN,
  }
}

/**
 * A amostra de um tick. Mira reta para cima ou para baixo não tem rumo e não
 * conta; o rumo seguinte se mede contra o último que tinha.
 */
export function noteYaw(tracker: YawTurnTracker, atS: number, aimM: Readonly<Vector3>): void {
  const heading = diamondHeading(aimM.x, aimM.z)
  if (Number.isNaN(heading)) return
  const previous = Number.isNaN(tracker.heading) ? heading : tracker.heading
  tracker.heading = heading
  tracker.atS[tracker.next] = atS
  tracker.turnDeg[tracker.next] = wrapQuarterTurns(heading - previous) * DEGREES_PER_QUARTER
  tracker.next = (tracker.next + 1) % tracker.atS.length
}

/** O giro, em graus, das amostras de depois de `atS - windowS`. */
export function yawTurnWithin(tracker: YawTurnTracker, atS: number, windowS: number): number {
  const since = atS - windowS
  let turn = 0
  for (let index = 0; index < tracker.atS.length; index += 1) {
    if ((tracker.atS[index] as number) > since) turn += tracker.turnDeg[index] as number
  }
  return Math.abs(turn)
}

/** O rumo no losango: 0 em +x, 1 em +z, 2 em -x, 3 em -z; `NaN` sem rumo. */
function diamondHeading(x: number, z: number): number {
  if (x === 0 && z === 0) return Number.NaN
  if (z >= 0) return x >= 0 ? z / (x + z) : 1 - x / (-x + z)
  return x < 0 ? 2 - z / (-x - z) : 3 + x / (x - z)
}

/** A diferença de rumo pelo caminho mais curto, entre -2 e 2 (meia volta). */
function wrapQuarterTurns(delta: number): number {
  if (delta > 2) return delta - 4
  if (delta < -2) return delta + 4
  return delta
}
