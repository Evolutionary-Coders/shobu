import type { Vector3 } from '../math/vector3.ts'

/**
 * O mapa que o bot entende: pontos onde se pisa e as ligações entre eles. A
 * colisão continua sendo a das caixas — o grafo não substitui a física, ele só
 * diz **para onde** andar; quem decide se deu para chegar é `stepCharacter`,
 * o mesmo do jogador (ADR 0016).
 *
 * Declarado à mão junto ao layout, e não derivado das caixas: derivar exigiria
 * simular cada par de pontos na carga, e o que garante que o grafo e a arena
 * concordam é o teste que anda cada ligação com a física de verdade.
 *
 * Os três tipos de ligação são o que muda no comando, não no caminho:
 *
 * - `walk`: anda em linha reta, nos dois sentidos se declarada assim;
 * - `jump`: pula ao sair e pula de novo no alto — é o pulo duplo do jogador;
 * - `drop`: anda até a borda e cai. Só desce, então é sempre de mão única.
 */
export type NavLinkKind = 'walk' | 'jump' | 'drop'

export interface NavNode {
  readonly name: string
  /** O pé, em metros, já apoiado no piso. */
  readonly feetM: Readonly<Vector3>
}

export interface NavLink {
  readonly from: number
  readonly to: number
  readonly kind: NavLinkKind
  /** O custo da rota: a distância em linha reta entre os dois pés. */
  readonly lengthM: number
}

export interface NavGraph {
  readonly nodes: readonly NavNode[]
  readonly links: readonly NavLink[]
  /** As ligações que saem de cada nó, por índice em `links`. */
  readonly outgoing: readonly (readonly number[])[]
}

/** Uma ligação como o layout a escreve: pelos nomes, e de mão dupla quando `walk`. */
export interface NavLinkSpec {
  readonly from: string
  readonly to: string
  readonly kind: NavLinkKind
}

/**
 * Monta o grafo e recusa o que não faz sentido: nome repetido, ligação para nó
 * que não existe e ligação de um nó para ele mesmo. `walk` vira duas ligações,
 * uma em cada sentido; `jump` e `drop` ficam de mão única, porque descer de um
 * pulo não é o mesmo comando que subir nele.
 *
 * ```ts
 * createNavGraph([{ name: 'a', feetM }, { name: 'b', feetM: other }], [{ from: 'a', to: 'b', kind: 'walk' }])
 * ```
 */
export function createNavGraph(nodes: readonly NavNode[], specs: readonly NavLinkSpec[]): NavGraph {
  const indexByName = indexNodes(nodes)
  const links = specs.flatMap((spec) => linksOf(spec, indexByName, nodes))
  const outgoing = nodes.map((_node, index) =>
    links.flatMap((link, linkIndex) => (link.from === index ? [linkIndex] : [])),
  )
  return { nodes, links, outgoing }
}

function indexNodes(nodes: readonly NavNode[]): ReadonlyMap<string, number> {
  const indexByName = new Map<string, number>()
  for (const [index, node] of nodes.entries()) {
    if (indexByName.has(node.name)) {
      throw new RangeError(`nó de navegação '${node.name}' repetido; esperado nome único por nó`)
    }
    indexByName.set(node.name, index)
  }
  return indexByName
}

function linksOf(
  spec: NavLinkSpec,
  indexByName: ReadonlyMap<string, number>,
  nodes: readonly NavNode[],
): readonly NavLink[] {
  const from = requireNode(indexByName, spec.from)
  const to = requireNode(indexByName, spec.to)
  if (from === to) {
    throw new RangeError(`ligação de '${spec.from}' para ele mesmo; esperado dois nós distintos`)
  }
  const lengthM = distanceM(feetOf(nodes, from), feetOf(nodes, to))
  const forward: NavLink = { from, to, kind: spec.kind, lengthM }
  if (spec.kind !== 'walk') return [forward]
  return [forward, { from: to, to: from, kind: 'walk', lengthM }]
}

function requireNode(indexByName: ReadonlyMap<string, number>, name: string): number {
  const index = indexByName.get(name)
  if (index !== undefined) return index
  throw new RangeError(`ligação cita o nó '${name}', que não existe; esperado um nó declarado`)
}

/** O índice vem de `indexNodes`, sobre a mesma lista: ele sempre existe. */
function feetOf(nodes: readonly NavNode[], index: number): Readonly<Vector3> {
  return (nodes[index] as NavNode).feetM
}

function distanceM(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Quanto um metro de altura pesa contra um de chão, ao procurar o nó mais
 * perto. Sem peso, quem está na rua logo abaixo da ponte "estaria" na ponte, e
 * a rota começaria por um ponto quatro metros acima dele.
 */
const HEIGHT_WEIGHT = 4

/**
 * O nó mais perto de um pé, com a altura pesando mais que o chão. É onde a
 * rota começa depois de um respawn ou de um destravamento.
 *
 * ```ts
 * nearestNavNode(graph, bot.body.position) // 7
 * ```
 */
export function nearestNavNode(graph: NavGraph, feetM: Readonly<Vector3>): number {
  let best = -1
  let bestScore = Number.POSITIVE_INFINITY
  for (const [index, node] of graph.nodes.entries()) {
    const dx = node.feetM.x - feetM.x
    const dy = (node.feetM.y - feetM.y) * HEIGHT_WEIGHT
    const dz = node.feetM.z - feetM.z
    const score = dx * dx + dy * dy + dz * dz
    if (score >= bestScore) continue
    best = index
    bestScore = score
  }
  if (best < 0) throw new RangeError('nearestNavNode recebeu grafo vazio; esperado ao menos um nó')
  return best
}

/**
 * A ligação de `from` para `to`, ou -1. É o que diz ao bot **como** atravessar
 * o trecho em que ele está: andando, pulando ou caindo.
 */
export function linkBetween(graph: NavGraph, from: number, to: number): number {
  for (const linkIndex of graph.outgoing[from] ?? []) {
    // `outgoing` só guarda índices de `links`: a ligação sempre existe.
    if ((graph.links[linkIndex] as NavLink).to === to) return linkIndex
  }
  return -1
}
