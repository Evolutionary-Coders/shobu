import type { NavGraph, NavLink } from './navGraph.ts'

/**
 * A rota de um bot: a sequência de nós até o destino, e onde ele está nela.
 *
 * Em vetor tipado do tamanho do grafo, criado uma vez por bot: planejar rota
 * acontece a cada destino novo, que é evento de segundos, mas fica no laço de
 * tick — e o nfr.md proíbe alocar ali.
 */
export interface NavRoute {
  readonly nodes: Int32Array
  length: number
  /** O índice, em `nodes`, do ponto para onde o bot anda agora. */
  cursor: number
}

/** O rascunho do Dijkstra, também do tamanho do grafo e também reaproveitado. */
export interface RoutePlanner {
  readonly costM: Float64Array
  readonly previous: Int32Array
  readonly settled: Uint8Array
}

/**
 * ```ts
 * const route = createNavRoute(graph)
 * ```
 */
export function createNavRoute(graph: NavGraph): NavRoute {
  return { nodes: new Int32Array(graph.nodes.length), length: 0, cursor: 0 }
}

export function createRoutePlanner(graph: NavGraph): RoutePlanner {
  const size = graph.nodes.length
  return {
    costM: new Float64Array(size),
    previous: new Int32Array(size),
    settled: new Uint8Array(size),
  }
}

/** O nó para onde o bot anda agora, ou -1 com a rota terminada. */
export function currentWaypoint(route: Readonly<NavRoute>): number {
  return route.cursor < route.length ? (route.nodes[route.cursor] as number) : -1
}

/** O nó de onde o bot saiu para chegar no atual, ou -1 no primeiro trecho. */
export function previousWaypoint(route: Readonly<NavRoute>): number {
  return route.cursor > 0 && route.cursor <= route.length
    ? (route.nodes[route.cursor - 1] as number)
    : -1
}

/**
 * O caminho mais curto de `from` a `to`, escrito em `route`. Dijkstra simples,
 * em O(n²): o grafo da arena tem dezenas de nós, e uma fila de prioridade
 * custaria mais em código do que economiza em conta.
 *
 * Devolve se achou caminho. Sem caminho, a rota fica vazia, e quem chamou
 * escolhe outro destino.
 *
 * ```ts
 * planRoute(graph, planner, nearestNavNode(graph, feetM), destination, route)
 * ```
 */
export function planRoute(
  graph: NavGraph,
  planner: RoutePlanner,
  from: number,
  to: number,
  route: NavRoute,
): boolean {
  assertNode(graph, from, 'from')
  assertNode(graph, to, 'to')
  resetPlanner(planner, from)
  for (let step = 0; step < graph.nodes.length; step += 1) {
    const node = cheapestOpen(planner)
    if (node < 0 || node === to) break
    planner.settled[node] = 1
    relaxFrom(graph, planner, node)
  }
  return writeRoute(planner, from, to, route)
}

function assertNode(graph: NavGraph, index: number, label: string): void {
  if (Number.isInteger(index) && index >= 0 && index < graph.nodes.length) return
  throw new RangeError(
    `planRoute recebeu ${label} ${index}; esperado índice de nó entre 0 e ${graph.nodes.length - 1}`,
  )
}

function resetPlanner(planner: RoutePlanner, from: number): void {
  planner.costM.fill(Number.POSITIVE_INFINITY)
  planner.previous.fill(-1)
  planner.settled.fill(0)
  planner.costM[from] = 0
}

/** O nó aberto de menor custo, ou -1 quando nenhum alcançável sobrou. */
function cheapestOpen(planner: RoutePlanner): number {
  let best = -1
  let bestCost = Number.POSITIVE_INFINITY
  for (let node = 0; node < planner.costM.length; node += 1) {
    const cost = planner.costM[node] as number
    if (planner.settled[node] === 1 || cost >= bestCost) continue
    best = node
    bestCost = cost
  }
  return best
}

function relaxFrom(graph: NavGraph, planner: RoutePlanner, node: number): void {
  const base = planner.costM[node] as number
  for (const linkIndex of graph.outgoing[node] as readonly number[]) {
    const link = graph.links[linkIndex] as NavLink
    const cost = base + link.lengthM
    if (cost >= (planner.costM[link.to] as number)) continue
    planner.costM[link.to] = cost
    planner.previous[link.to] = node
  }
}

/** Do destino para trás pelo `previous`, e então invertido no lugar. */
function writeRoute(planner: RoutePlanner, from: number, to: number, route: NavRoute): boolean {
  route.length = 0
  route.cursor = 0
  if (planner.costM[to] === Number.POSITIVE_INFINITY) return false
  for (let node = to; node !== from; node = planner.previous[node] as number) {
    route.nodes[route.length] = node
    route.length += 1
  }
  route.nodes[route.length] = from
  route.length += 1
  reverseInPlace(route.nodes, route.length)
  return true
}

/** `subarray().reverse()` criaria uma vista por planejamento; trocar à mão não cria nada. */
function reverseInPlace(nodes: Int32Array, length: number): void {
  for (let low = 0, high = length - 1; low < high; low += 1, high -= 1) {
    const swap = nodes[low] as number
    nodes[low] = nodes[high] as number
    nodes[high] = swap
  }
}
