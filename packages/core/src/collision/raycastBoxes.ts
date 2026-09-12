import type { Vector3 } from '../math/vector3.ts'
import type { StaticBox } from './staticBox.ts'

/**
 * Distância do primeiro acerto de um raio contra as caixas da arena, ou
 * `undefined` se nada é atingido dentro de `maxDistanceM`. É o teste de faixas
 * (slab test) clássico, sem trigonometria: só divisão e comparação, então serve
 * ao caminho determinístico (ADR 0003).
 *
 * Quem usa hoje é o traçador do tiro, para o feixe parar na parede em vez de
 * atravessá-la. Amanhã é o hitscan do servidor contra a mesma geometria, que é
 * o motivo de isto viver no núcleo e não no cliente.
 *
 * **A direção não é normalizada aqui**: o número devolvido é o `t` ao longo do
 * vetor recebido, então quem quiser metro passa vetor unitário.
 *
 * ```ts
 * raycastBoxes({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, boxes, 50) // 4.6
 * ```
 */
export function raycastBoxes(
  origin: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  boxes: readonly StaticBox[],
  maxDistanceM: number,
): number | undefined {
  if (!(maxDistanceM > 0)) {
    throw new RangeError(`maxDistanceM recebeu ${maxDistanceM}; esperado número > 0`)
  }
  let nearest = maxDistanceM
  let hit = false
  for (const box of boxes) {
    const distance = rayBoxDistance(origin, direction, box)
    if (distance === undefined || distance >= nearest) continue
    nearest = distance
    hit = true
  }
  return hit ? nearest : undefined
}

/** Entrada do raio na caixa, ou `undefined`. Origem dentro da caixa conta como 0. */
function rayBoxDistance(
  origin: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  box: StaticBox,
): number | undefined {
  let entry = Number.NEGATIVE_INFINITY
  let exit = Number.POSITIVE_INFINITY
  const axes: readonly ['x' | 'y' | 'z', number, number][] = [
    ['x', box.minX, box.maxX],
    ['y', box.minY, box.maxY],
    ['z', box.minZ, box.maxZ],
  ]
  for (const [axis, min, max] of axes) {
    const slab = slabInterval(origin[axis], direction[axis], min, max)
    if (!slab) return undefined
    entry = Math.max(entry, slab[0])
    exit = Math.min(exit, slab[1])
    if (entry > exit) return undefined
  }
  if (exit < 0) return undefined
  return Math.max(0, entry)
}

/** Intervalo de `t` em que o raio está entre as duas faces de um eixo. */
function slabInterval(
  origin: number,
  direction: number,
  min: number,
  max: number,
): readonly [number, number] | undefined {
  if (direction === 0) {
    return origin >= min && origin <= max
      ? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]
      : undefined
  }
  const near = (min - origin) / direction
  const far = (max - origin) / direction
  return near < far ? [near, far] : [far, near]
}
