import { type BoxHit, createBoxHit, nearestBoxHit } from '../collision/raycastBoxes.ts'
import { nearestTargetHit } from '../collision/raycastTargets.ts'
import type { StaticBox } from '../collision/staticBox.ts'
import type { TargetList } from '../collision/targetList.ts'
import type { SeededRandom } from '../math/seededRandom.ts'
import { addScaled, normalizeInPlace, type Vector3 } from '../math/vector3.ts'
import { applySpread } from './aimSpread.ts'

/** De onde e para onde o tiro sai, e com que precisão. */
export interface ShotOrigin {
  /** O olho, **sem balanço de câmera**: é o que o servidor rebobina (ADR 0002). */
  readonly originM: Readonly<Vector3>
  readonly aimM: Readonly<Vector3>
  /** Com a mira assentada o tiro é exato e não sofre dispersão nenhuma. */
  readonly exact: boolean
  readonly spreadTangent: number
  readonly maxDistanceM: number
}

export interface ShotHit {
  /** `sourceIndex` do alvo atingido, ou -1 quando o tiro achou parede ou nada. */
  targetIndex: number
  /** Distância do acerto, ou `maxDistanceM` quando nada foi achado. */
  distanceM: number
  /** Onde o rastro termina, em mundo. É o dado do feixe do laser. */
  readonly endpointM: Vector3
  /** A direção de fato usada, já com a dispersão aplicada. */
  readonly directionM: Vector3
}

export function createShotHit(): ShotHit {
  return {
    targetIndex: -1,
    distanceM: 0,
    endpointM: { x: 0, y: 0, z: 0 },
    directionM: { x: 0, y: 0, z: 1 },
  }
}

/**
 * Um tiro hitscan: sem queda e sem tempo de voo (modelo de simulação).
 *
 * **A parede ganha do alvo quando está mais perto** — é o que impede matar
 * através de cobertura, e é a única regra aqui que não é geometria.
 *
 * ```ts
 * resolveShot({ originM: eye, aimM: forward, exact, spreadTangent, maxDistanceM }, boxes, targets, rng, hit)
 * ```
 */
export function resolveShot(
  shot: Readonly<ShotOrigin>,
  world: readonly StaticBox[],
  targets: Readonly<TargetList>,
  rng: SeededRandom,
  out: ShotHit,
): ShotHit {
  out.directionM.x = shot.aimM.x
  out.directionM.y = shot.aimM.y
  out.directionM.z = shot.aimM.z
  normalizeInPlace(out.directionM)
  if (!shot.exact) applySpread(out.directionM, shot.spreadTangent, rng)
  const wall = nearestBoxHit(shot.originM, out.directionM, world, shot.maxDistanceM, wallHit)
    ? wallHit.distanceM
    : shot.maxDistanceM
  const hitTarget =
    nearestTargetHit(shot.originM, out.directionM, targets, shot.maxDistanceM, targetHit) &&
    targetHit.distanceM < wall
  out.targetIndex = hitTarget ? (targets.sourceIndex[targetHit.index] ?? -1) : -1
  out.distanceM = hitTarget ? targetHit.distanceM : wall
  out.endpointM.x = shot.originM.x
  out.endpointM.y = shot.originM.y
  out.endpointM.z = shot.originM.z
  addScaled(out.endpointM, out.directionM, out.distanceM)
  return out
}

// dois resultados de módulo: um tiro por tick, e nada aloca no caminho quente.
const wallHit: BoxHit = createBoxHit()
const targetHit: BoxHit = createBoxHit()
