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
  return nearestBoxHit(origin, direction, boxes, maxDistanceM, scratch)
    ? scratch.distanceM
    : undefined
}

/** Qual caixa o raio atingiu, e a que distância. */
export interface BoxHit {
  /** Índice em `boxes`, ou -1 quando nada foi atingido. */
  index: number
  distanceM: number
}

export function createBoxHit(): BoxHit {
  return { index: -1, distanceM: 0 }
}

/**
 * Como `raycastBoxes`, mas diz **qual** caixa foi atingida. Devolve se acertou
 * e escreve o resultado em `out`, sem alocar.
 *
 * ```ts
 * if (nearestBoxHit(eye, aim, boxes, 400, hit)) console.log(boxes[hit.index])
 * ```
 */
export function nearestBoxHit(
  origin: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  boxes: readonly StaticBox[],
  maxDistanceM: number,
  out: BoxHit,
): boolean {
  if (!(maxDistanceM > 0)) {
    throw new RangeError(`maxDistanceM recebeu ${maxDistanceM}; esperado número > 0`)
  }
  out.index = -1
  out.distanceM = maxDistanceM
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index]
    if (!box) continue
    const distance = rayBoxDistance(origin, direction, box)
    if (distance === undefined || distance >= out.distanceM) continue
    out.distanceM = distance
    out.index = index
  }
  return out.index >= 0
}

// um resultado reaproveitado pelo embrulho: o mesmo desenho do `probe` de
// `sweepCharacter.ts`, e o motivo é o mesmo — nada aloca no caminho quente.
const scratch = createBoxHit()

/** Entrada do raio na caixa, ou `undefined`. Origem dentro da caixa conta como 0. */
export function rayBoxDistance(
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
