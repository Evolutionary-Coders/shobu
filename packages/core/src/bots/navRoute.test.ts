import { describe, expect, it } from 'vitest'
import { createNavGraph, type NavNode } from './navGraph.ts'
import {
  createNavRoute,
  createRoutePlanner,
  currentWaypoint,
  type NavRoute,
  planRoute,
  previousWaypoint,
} from './navRoute.ts'

/**
 * Um quadrado com um atalho comprido e uma ilha:
 *
 * ```
 *   c ── d
 *   │    │
 *   a ── b      ilha (sem ligação)
 * ```
 */
const NODES: readonly NavNode[] = [
  { name: 'a', feetM: { x: 0, y: 0, z: 0 } },
  { name: 'b', feetM: { x: 10, y: 0, z: 0 } },
  { name: 'c', feetM: { x: 0, y: 0, z: 10 } },
  { name: 'd', feetM: { x: 10, y: 0, z: 10 } },
  { name: 'ilha', feetM: { x: 50, y: 0, z: 50 } },
]
const GRAPH = createNavGraph(NODES, [
  { from: 'a', to: 'b', kind: 'walk' },
  { from: 'b', to: 'd', kind: 'walk' },
  { from: 'a', to: 'c', kind: 'walk' },
  { from: 'c', to: 'd', kind: 'drop' },
])

function routeOf(route: NavRoute): readonly number[] {
  return [...route.nodes.subarray(0, route.length)]
}

describe('planRoute', () => {
  it('acha o caminho mais curto, começando no nó de saída', () => {
    const route = createNavRoute(GRAPH)
    expect(planRoute(GRAPH, createRoutePlanner(GRAPH), 0, 3, route)).toBe(true)
    // os dois lados do quadrado custam o mesmo; o primeiro relaxado fica.
    expect(routeOf(route)).toEqual([0, 1, 3])
  })

  it('respeita a mão única: a queda de c para d não volta', () => {
    const route = createNavRoute(GRAPH)
    planRoute(GRAPH, createRoutePlanner(GRAPH), 3, 2, route)
    expect(routeOf(route)).toEqual([3, 1, 0, 2])
  })

  it('o destino igual à saída é uma rota de um nó só', () => {
    const route = createNavRoute(GRAPH)
    expect(planRoute(GRAPH, createRoutePlanner(GRAPH), 2, 2, route)).toBe(true)
    expect(routeOf(route)).toEqual([2])
  })

  it('sem caminho, devolve falso e deixa a rota vazia', () => {
    const route = createNavRoute(GRAPH)
    planRoute(GRAPH, createRoutePlanner(GRAPH), 0, 3, route)
    expect(planRoute(GRAPH, createRoutePlanner(GRAPH), 0, 4, route)).toBe(false)
    expect(route.length).toBe(0)
  })

  /** O planejador é reaproveitado entre bots e destinos: nada do anterior vaza. */
  it('o mesmo planejador serve a vários planejamentos', () => {
    const planner = createRoutePlanner(GRAPH)
    const route = createNavRoute(GRAPH)
    planRoute(GRAPH, planner, 0, 3, route)
    planRoute(GRAPH, planner, 2, 1, route)
    expect(routeOf(route)).toEqual([2, 0, 1])
  })

  it.each([
    [-1, 0, 'from -1'],
    [0, 5, 'to 5'],
    [0.5, 0, 'from 0.5'],
  ])('recusa nó fora do grafo (%s → %s)', (from, to, label) => {
    expect(() =>
      planRoute(GRAPH, createRoutePlanner(GRAPH), from, to, createNavRoute(GRAPH)),
    ).toThrow(new RegExp(`${label}; esperado índice de nó entre 0 e 4`))
  })
})

describe('o cursor da rota', () => {
  it('o ponto atual anda com o cursor, e o anterior vem junto', () => {
    const route = createNavRoute(GRAPH)
    planRoute(GRAPH, createRoutePlanner(GRAPH), 0, 3, route)
    expect([currentWaypoint(route), previousWaypoint(route)]).toEqual([0, -1])
    route.cursor = 2
    expect([currentWaypoint(route), previousWaypoint(route)]).toEqual([3, 1])
  })

  it('rota terminada não tem ponto atual nem anterior', () => {
    const route = createNavRoute(GRAPH)
    planRoute(GRAPH, createRoutePlanner(GRAPH), 0, 3, route)
    route.cursor = 4
    expect([currentWaypoint(route), previousWaypoint(route)]).toEqual([-1, -1])
  })
})
