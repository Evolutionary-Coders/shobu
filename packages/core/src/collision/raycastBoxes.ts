import type { Vector3 } from '../math/vector3.ts'
import { BOX_GRID_CELL_M, type BoxGrid, boxGridOf, cellIndex, cellSpan } from './boxGrid.ts'
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
  const grid = boxGridOf(boxes)
  beginRay(grid, boxes, origin, direction, stops, out)
  for (const index of grid.always) consider(index)
  walkCells(grid, origin, direction, maxDistanceM)
  return out.index >= 0
}

/**
 * O raio em curso, no módulo e não em fecho: o raio do gancho roda a cada
 * tick, e um fecho por raio era lixo para o coletor. Não é reentrante — e
 * nada aqui chama outro raio no meio.
 */
const ray = {
  grid: undefined as BoxGrid | undefined,
  boxes: [] as readonly StaticBox[],
  origin: { x: 0, y: 0, z: 0 } as Readonly<Vector3>,
  direction: { x: 0, y: 0, z: 0 } as Readonly<Vector3>,
  stops: 0,
  out: { index: -1, distanceM: 0 } as BoxHit,
}

function beginRay(
  grid: BoxGrid,
  boxes: readonly StaticBox[],
  origin: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  stops: number,
  out: BoxHit,
): void {
  // a marca dá a volta em 2^32 raios: aí as marcas velhas são zeradas.
  grid.stamp = (grid.stamp + 1) >>> 0
  if (grid.stamp === 0) {
    grid.seen.fill(0)
    grid.stamp = 1
  }
  ray.grid = grid
  ray.boxes = boxes
  ray.origin = origin
  ray.direction = direction
  ray.stops = stops
  ray.out = out
}

/** Testa a caixa `index`, uma vez por raio. No empate de distância vence o menor índice. */
function consider(index: number): void {
  const grid = ray.grid as BoxGrid
  if (grid.seen[index] === grid.stamp) return
  grid.seen[index] = grid.stamp
  const box = ray.boxes[index] as StaticBox
  if (!stopsAny(box.mask, ray.stops)) return
  const distance = rayBoxDistance(ray.origin, ray.direction, box)
  if (distance === undefined || distance > ray.out.distanceM) return
  if (distance === ray.out.distanceM && (ray.out.index < 0 || index > ray.out.index)) return
  ray.out.distanceM = distance
  ray.out.index = index
}

/** O passo do DDA num eixo: a próxima fronteira de célula e quanto `t` anda entre duas. */
const walk = { column: 0, row: 0, stepX: 0, stepZ: 0, nextX: 0, nextZ: 0, deltaX: 0, deltaZ: 0 }

/**
 * Anda pelas células do plano do chão por onde o raio passa, da entrada na
 * grade até o alcance, e para quando a célula seguinte começa depois do
 * acerto que já se tem — nada lá pode estar mais perto.
 */
function walkCells(
  grid: BoxGrid,
  origin: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  maxDistanceM: number,
): void {
  const span = gridSpan(grid, origin, direction, maxDistanceM)
  if (span === undefined) return
  startWalk(grid, origin, direction, span.enter)
  let leave = Math.min(walk.nextX, walk.nextZ)
  visitCell(grid)
  while (leave <= span.exit && !(ray.out.index >= 0 && ray.out.distanceM < leave)) {
    stepWalk()
    if (walk.column < 0 || walk.row < 0 || walk.column >= grid.columns || walk.row >= grid.rows)
      return
    visitCell(grid)
    leave = Math.min(walk.nextX, walk.nextZ)
  }
}

function visitCell(grid: BoxGrid): void {
  const cell = cellIndex(grid, walk.column, walk.row)
  const end = grid.cellStart[cell + 1] as number
  for (let at = grid.cellStart[cell] as number; at < end; at += 1)
    consider(grid.cellBoxes[at] as number)
}

function startWalk(
  grid: BoxGrid,
  origin: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  enter: number,
): void {
  const x = origin.x + direction.x * enter
  const z = origin.z + direction.z * enter
  walk.column = cellSpan(x, x, grid.originX, grid.columns)[0]
  walk.row = cellSpan(z, z, grid.originZ, grid.rows)[0]
  walk.stepX = Math.sign(direction.x)
  walk.stepZ = Math.sign(direction.z)
  walk.deltaX = direction.x === 0 ? Infinity : BOX_GRID_CELL_M / Math.abs(direction.x)
  walk.deltaZ = direction.z === 0 ? Infinity : BOX_GRID_CELL_M / Math.abs(direction.z)
  walk.nextX = nextBoundary(origin.x, direction.x, grid.originX, walk.column)
  walk.nextZ = nextBoundary(origin.z, direction.z, grid.originZ, walk.row)
}

/** O `t` em que o raio cruza a próxima fronteira de célula do eixo, saindo da célula `cell`. */
function nextBoundary(origin: number, direction: number, gridOrigin: number, cell: number): number {
  if (direction === 0) return Infinity
  const boundary = gridOrigin + (cell + (direction > 0 ? 1 : 0)) * BOX_GRID_CELL_M
  return (boundary - origin) / direction
}

function stepWalk(): void {
  if (walk.nextX < walk.nextZ) {
    walk.column += walk.stepX
    walk.nextX += walk.deltaX
    return
  }
  walk.row += walk.stepZ
  walk.nextZ += walk.deltaZ
}

/** O trecho do raio dentro do retângulo da grade, ou `undefined` se ele não passa por ela. */
function gridSpan(
  grid: BoxGrid,
  origin: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  maxDistanceM: number,
) {
  interval.entry = 0
  interval.exit = maxDistanceM
  const width = grid.columns * BOX_GRID_CELL_M
  const depth = grid.rows * BOX_GRID_CELL_M
  if (!clipSlab(origin.x, direction.x, grid.originX, grid.originX + width)) return undefined
  if (!clipSlab(origin.z, direction.z, grid.originZ, grid.originZ + depth)) return undefined
  span.enter = interval.entry
  span.exit = interval.exit
  return span
}

const span = { enter: 0, exit: 0 }

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
