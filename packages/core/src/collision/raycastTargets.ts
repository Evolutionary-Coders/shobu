import type { Vector3 } from '../math/vector3.ts'
import { type BoxHit, rayBoxDistance } from './raycastBoxes.ts'
import type { StaticBox } from './staticBox.ts'
import type { TargetList } from './targetList.ts'

/**
 * O alvo mais próximo na linha do raio. Devolve se acertou e escreve em `out`,
 * sem alocar; `out.index` é o `sourceIndex` do alvo, e não a posição na lista.
 *
 * O alvo é a mesma cápsula contra a qual o sweep já colide, virada em caixa: o
 * que se atira é o que se esbarra, e silhueta maior que hitbox é tiro que
 * acerta na tela e não conta (`competitorAvatar.ts`).
 *
 * ```ts
 * if (nearestTargetHit(eye, aim, targets, 400, hit)) kill(hit.index)
 * ```
 */
export function nearestTargetHit(
  origin: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  targets: Readonly<TargetList>,
  maxDistanceM: number,
  out: BoxHit,
): boolean {
  if (!(maxDistanceM > 0)) {
    throw new RangeError(`maxDistanceM recebeu ${maxDistanceM}; esperado número > 0`)
  }
  out.index = -1
  out.distanceM = maxDistanceM
  // a lista é pré-alocada: `count` diz quantos dos slots valem hoje.
  let index = -1
  for (const target of targets.boxes) {
    index += 1
    if (index >= targets.count) break
    box.minX = target.feetX - target.radiusM
    box.maxX = target.feetX + target.radiusM
    box.minY = target.feetY
    box.maxY = target.feetY + target.heightM
    box.minZ = target.feetZ - target.radiusM
    box.maxZ = target.feetZ + target.radiusM
    const distance = rayBoxDistance(origin, direction, box)
    if (distance === undefined || distance >= out.distanceM) continue
    out.distanceM = distance
    out.index = target.sourceIndex
  }
  return out.index >= 0
}

// uma caixa reaproveitada para virar a cápsula do alvo em faixa, sem alocar.
const box: { -readonly [Key in keyof StaticBox]: StaticBox[Key] } = {
  minX: 0,
  minY: 0,
  minZ: 0,
  maxX: 0,
  maxY: 0,
  maxZ: 0,
}
