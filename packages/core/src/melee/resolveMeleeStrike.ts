import { STOPS_SHOT } from '../collision/colliderMask.ts'
import { type BoxHit, createBoxHit, nearestBoxHit } from '../collision/raycastBoxes.ts'
import type { StaticBox } from '../collision/staticBox.ts'
import type { Fighter } from '../match/fighter.ts'
import { dot, normalizeInPlace, type Vector3 } from '../math/vector3.ts'
import type { StrikeReach } from './meleeReach.ts'

/** De onde e para onde o golpe sai, e quem o deu. */
export interface MeleeStrikeOrigin {
  readonly strikerIndex: number
  readonly eyeM: Readonly<Vector3>
  readonly aimM: Readonly<Vector3>
  readonly reach: StrikeReach
}

/** O que o golpe achou. Reaproveitado, como o `ShotHit`. */
export interface MeleeHit {
  /** Índice da vítima em `fighters`, ou -1. */
  targetIndex: number
  /** Do olho do atacante ao ponto mais perto do eixo da vítima. */
  distanceM: number
}

export function createMeleeHit(): MeleeHit {
  return { targetIndex: -1, distanceM: 0 }
}

/**
 * O golpe pega o vivo **mais perto** dentro do alcance e do arco à frente da
 * mira, com a linha livre de parede. Alcance conta até a **superfície** da
 * cápsula: é o que o jogador vê, e a faca de 2 m não exige enfiar a câmera no
 * peito de ninguém.
 *
 * O ponto da vítima é o do eixo da cápsula mais perto do olho — de pé, de
 * agachado ou deitado no slide, o golpe mira o que existe ali.
 *
 * ```ts
 * resolveMeleeStrike({ strikerIndex: 0, eyeM, aimM, reach: reach.knife }, fighters, boxes, radiusM, hit)
 * ```
 */
export function resolveMeleeStrike(
  origin: MeleeStrikeOrigin,
  fighters: readonly Fighter[],
  boxes: readonly StaticBox[],
  radiusM: number,
  out: MeleeHit,
): number {
  out.targetIndex = -1
  out.distanceM = Number.POSITIVE_INFINITY
  aimUnit.x = origin.aimM.x
  aimUnit.y = origin.aimM.y
  aimUnit.z = origin.aimM.z
  normalizeInPlace(aimUnit)
  for (const [index, fighter] of fighters.entries()) {
    if (index === origin.strikerIndex || !fighter.alive) continue
    const distanceM = reachableDistanceM(origin, fighter, boxes, radiusM)
    if (distanceM >= out.distanceM) continue
    out.targetIndex = index
    out.distanceM = distanceM
  }
  if (out.targetIndex < 0) out.distanceM = 0
  return out.targetIndex
}

/** A distância até a vítima, ou infinito quando o golpe não a alcança. */
function reachableDistanceM(
  origin: MeleeStrikeOrigin,
  fighter: Fighter,
  boxes: readonly StaticBox[],
  radiusM: number,
): number {
  const distanceM = towardAxis(origin.eyeM, fighter)
  if (distanceM - radiusM > origin.reach.reachM) return Number.POSITIVE_INFINITY
  // dentro da cápsula não há direção que conte: o golpe pega.
  if (distanceM <= radiusM) return distanceM
  if (dot(aimUnit, toward) < origin.reach.minCos) return Number.POSITIVE_INFINITY
  // a lâmina para no que para a bala: o letreiro que tapa o tiro tapa o
  // golpe, e a lanterna, que a bala atravessa, não tapa nenhum dos dois.
  if (nearestBoxHit(origin.eyeM, toward, boxes, distanceM - radiusM, STOPS_SHOT, wall)) {
    return Number.POSITIVE_INFINITY
  }
  return distanceM
}

/** Escreve em `toward` a direção unitária do olho ao eixo da vítima, e devolve a distância. */
function towardAxis(eyeM: Readonly<Vector3>, fighter: Fighter): number {
  const { position, capsuleHeightM } = fighter.body
  toward.x = position.x - eyeM.x
  toward.y = Math.min(position.y + capsuleHeightM, Math.max(position.y, eyeM.y)) - eyeM.y
  toward.z = position.z - eyeM.z
  const distanceM = Math.sqrt(dot(toward, toward))
  normalizeInPlace(toward)
  return distanceM
}

// rascunhos de módulo: um golpe por vez, e nada aloca no caminho quente.
const aimUnit: Vector3 = { x: 0, y: 0, z: 1 }
const toward: Vector3 = { x: 0, y: 0, z: 1 }
const wall: BoxHit = createBoxHit()
