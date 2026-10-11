import { describe, expect, it } from 'vitest'
import { createNavGraph, linkBetween, type NavNode, nearestNavNode } from './navGraph.ts'

const NODES: readonly NavNode[] = [
  { name: 'rua', feetM: { x: 0, y: 0, z: 0 } },
  { name: 'esquina', feetM: { x: 3, y: 0, z: 4 } },
  { name: 'telhado', feetM: { x: 0, y: 4.5, z: 1 } },
]

describe('createNavGraph', () => {
  it('liga os nós pelos nomes, com a distância em linha reta como custo', () => {
    const graph = createNavGraph(NODES, [{ from: 'rua', to: 'esquina', kind: 'walk' }])
    expect(graph.links[0]).toEqual({ from: 0, to: 1, kind: 'walk', lengthM: 5 })
  })

  it('andar vale nos dois sentidos', () => {
    const graph = createNavGraph(NODES, [{ from: 'rua', to: 'esquina', kind: 'walk' }])
    expect(graph.links.map((link) => [link.from, link.to])).toEqual([
      [0, 1],
      [1, 0],
    ])
  })

  /** Descer de um pulo não é o mesmo comando que subir nele. */
  it.each(['jump', 'drop'] as const)('%s fica de mão única', (kind) => {
    const graph = createNavGraph(NODES, [{ from: 'telhado', to: 'rua', kind }])
    expect(graph.links).toHaveLength(1)
    expect(graph.outgoing[0]).toEqual([])
    expect(graph.outgoing[2]).toEqual([0])
  })

  it('recusa nome repetido', () => {
    expect(() => createNavGraph([...NODES, NODES[0] as NavNode], [])).toThrow(/'rua' repetido/)
  })

  it('recusa ligação para nó que não existe, citando o nome', () => {
    expect(() => createNavGraph(NODES, [{ from: 'rua', to: 'ponte', kind: 'walk' }])).toThrow(
      /'ponte', que não existe/,
    )
  })

  it('recusa ligação de um nó para ele mesmo', () => {
    expect(() => createNavGraph(NODES, [{ from: 'rua', to: 'rua', kind: 'walk' }])).toThrow(
      /'rua' para ele mesmo/,
    )
  })
})

describe('nearestNavNode', () => {
  const graph = createNavGraph(NODES, [])

  it('acha o nó mais perto do pé', () => {
    expect(nearestNavNode(graph, { x: 2.5, y: 0, z: 3 })).toBe(1)
  })

  /** Debaixo do telhado, o pé está na rua: altura pesa mais que chão. */
  it('não confunde o chão com o telhado logo acima', () => {
    expect(nearestNavNode(graph, { x: 0, y: 0, z: 1.2 })).toBe(0)
    expect(nearestNavNode(graph, { x: 0.3, y: 4.5, z: 1.2 })).toBe(2)
  })

  it('recusa grafo vazio', () => {
    expect(() => nearestNavNode(createNavGraph([], []), { x: 0, y: 0, z: 0 })).toThrow(/vazio/)
  })
})

describe('linkBetween', () => {
  const graph = createNavGraph(NODES, [
    { from: 'rua', to: 'esquina', kind: 'walk' },
    { from: 'telhado', to: 'rua', kind: 'drop' },
  ])

  it('acha a ligação que sai de um nó para o outro', () => {
    expect(graph.links[linkBetween(graph, 2, 0)]?.kind).toBe('drop')
  })

  it('devolve -1 sem ligação, e também fora do grafo', () => {
    expect(linkBetween(graph, 0, 2)).toBe(-1)
    expect(linkBetween(graph, 9, 0)).toBe(-1)
  })
})
