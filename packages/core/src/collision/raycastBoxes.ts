import type { Vector3 } from '../math/vector3.ts'
import { stopsAny } from './colliderMask.ts'
import type { BoxBounds, StaticBox } from './staticBox.ts'

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
 * `stops` diz **quem** está perguntando (`colliderMask.ts`): só as caixas que
 * param essa pergunta contam. Obrigatório, porque não há resposta neutra — o
 * tiro passa pela lanterna em que o gancho prende.
 *
 * ```ts
 * raycastBoxes({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, boxes, 50, STOPS_SHOT) // 4.6
 * ```
 */
export function raycastBoxes(
  origin: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  boxes: readonly StaticBox[],
  maxDistanceM: number,
  stops: number,
): number | undefined {
  return nearestBoxHit(origin, direction, boxes, maxDistanceM, stops, scratch)
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
 * if (nearestBoxHit(eye, aim, boxes, 400, STOPS_GRAPPLE, hit)) console.log(boxes[hit.index])
 * ```
 */
export function nearestBoxHit(
  origin: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  boxes: readonly StaticBox[],
  maxDistanceM: number,
  stops: number,
  out: BoxHit,
): boolean {
  if (!(maxDistanceM > 0)) {
    throw new RangeError(`maxDistanceM recebeu ${maxDistanceM}; esperado número > 0`)
  }
  out.index = -1
  out.distanceM = maxDistanceM
  // `for...of` com contador à parte, como `sweepCharacter`: indexar por número
  // devolveria `StaticBox | undefined` e pediria uma guarda que não existe.
  let index = -1
  for (const box of boxes) {
    index += 1
    if (!stopsAny(box.mask, stops)) continue
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

/**
 * O intervalo de `t` em que o raio está dentro da caixa, recortado eixo a
 * eixo. Rascunho do módulo: o raio do gancho roda a cada tick contra a arena
 * inteira, e um par por eixo por caixa eram ~1500 arrays por tick para o
 * coletor (medido em 11/10).
 */
const interval = { entry: 0, exit: 0 }

/** Entrada do raio na caixa, ou `undefined`. Origem dentro da caixa conta como 0. */
export function rayBoxDistance(
  origin: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  box: Readonly<BoxBounds>,
): number | undefined {
  interval.entry = Number.NEGATIVE_INFINITY
  interval.exit = Number.POSITIVE_INFINITY
  if (!clipSlab(origin.x, direction.x, box.minX, box.maxX)) return undefined
  if (!clipSlab(origin.y, direction.y, box.minY, box.maxY)) return undefined
  if (!clipSlab(origin.z, direction.z, box.minZ, box.maxZ)) return undefined
  if (interval.exit < 0) return undefined
  return Math.max(0, interval.entry)
}

/**
 * Recorta o intervalo pelas duas faces de um eixo. Devolve se ainda sobra
 * intervalo. Raio paralelo ao eixo não recorta nada se estiver entre as faces,
 * e fica de fora se não estiver.
 */
function clipSlab(origin: number, direction: number, min: number, max: number): boolean {
  if (direction === 0) return origin >= min && origin <= max
  const near = (min - origin) / direction
  const far = (max - origin) / direction
  interval.entry = Math.max(interval.entry, Math.min(near, far))
  interval.exit = Math.min(interval.exit, Math.max(near, far))
  return interval.entry <= interval.exit
}
