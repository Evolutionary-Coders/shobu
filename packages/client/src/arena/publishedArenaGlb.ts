/**
 * Leitura mínima do glb publicado da arena, para os testes conferirem a
 * colisão da arte (`propCollider.ts`) contra a arte de verdade — sem engine e
 * sem dependência: o cabeçalho, o json e os acessores de posição.
 *
 * Só entende o que o build da arena grava: nó sem rotação, escala e
 * translação da quantização (`quantize-arena.mjs`), posição em float ou em
 * inteiro normalizado de 16 bits. Qualquer outra coisa é erro, com o nome do
 * nó: um glb diferente do esperado tem de reprovar, não passar em silêncio.
 *
 * O glb é y para cima com x espelhado em relação ao jogo
 * (`arena_geometry.game_to_blender` e o exportador do blender): o x do jogo é
 * o x do glb com o sinal trocado.
 */
import { readFileSync } from 'node:fs'
import type { Vec3 } from './arenaBlock.ts'

interface GlbAccessor {
  readonly bufferView: number
  readonly byteOffset?: number
  readonly componentType: number
  readonly count: number
  readonly normalized?: boolean
  readonly min: readonly number[]
  readonly max: readonly number[]
}

interface GlbNode {
  readonly name: string
  readonly mesh?: number
  readonly translation?: readonly number[]
  readonly scale?: readonly number[]
  readonly rotation?: readonly number[]
}

interface GlbJson {
  readonly nodes: readonly GlbNode[]
  readonly meshes: readonly {
    readonly primitives: readonly {
      readonly attributes: { readonly POSITION: number }
      readonly indices?: number
    }[]
  }[]
  readonly accessors: readonly GlbAccessor[]
  readonly bufferViews: readonly { readonly byteOffset?: number; readonly byteStride?: number }[]
}

export interface PublishedGlb {
  readonly json: GlbJson
  readonly bin: Buffer
}

/** Um volume alinhado, em coordenada do jogo. */
export interface GameBounds {
  readonly min: Vec3
  readonly max: Vec3
}

const PUBLIC_ARENA = new URL('../../public/assets/arena/', import.meta.url)
const FLOAT = 5126
const SHORT = 5122
const UNSIGNED_INT = 5125

/**
 * ```ts
 * const glb = readPublishedGlb('ichiban-gai.glb')
 * ```
 */
export function readPublishedGlb(fileName: string): PublishedGlb {
  return parseGlb(readFileSync(new URL(fileName, PUBLIC_ARENA)))
}

/** O json e o binário de um glb já em memória. */
export function parseGlb(bytes: Buffer): PublishedGlb {
  const jsonLength = bytes.readUInt32LE(12)
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as GlbJson
  const binStart = 20 + jsonLength
  return { json, bin: bytes.subarray(binStart + 8, binStart + 8 + bytes.readUInt32LE(binStart)) }
}

/** Os nós cujo nome começa com `prefix`. */
export function nodesNamed(glb: PublishedGlb, prefix: string): readonly GlbNode[] {
  return glb.json.nodes.filter((node) => node.name.startsWith(prefix))
}

/**
 * O volume de um nó com malha, pelos mínimos e máximos dos acessores — sem
 * ler vértice nenhum.
 */
export function nodeBounds(glb: PublishedGlb, node: GlbNode): GameBounds {
  const low = [Infinity, Infinity, Infinity]
  const high = [-Infinity, -Infinity, -Infinity]
  for (const accessor of positionAccessors(glb, node)) {
    for (let axis = 0; axis < 3; axis += 1) {
      const a = placed(node, axis, decode(accessor, accessor.min[axis] as number))
      const b = placed(node, axis, decode(accessor, accessor.max[axis] as number))
      low[axis] = Math.min(low[axis] as number, a, b)
      high[axis] = Math.max(high[axis] as number, a, b)
    }
  }
  return toGame(low, high)
}

/** Cada vértice da malha de um nó, em coordenada do jogo. */
export function nodeVertices(glb: PublishedGlb, node: GlbNode): readonly Vec3[] {
  return positionAccessors(glb, node).flatMap((accessor) => {
    const read = componentReader(glb, accessor)
    const at = (index: number, axis: number) =>
      placed(node, axis, decode(accessor, read(index, axis)))
    return Array.from({ length: accessor.count }, (_, index): Vec3 => {
      return [-at(index, 0), at(index, 1), at(index, 2)]
    })
  })
}

/**
 * As peças soltas da malha de um nó — os triângulos ligados por vértice
 * compartilhado —, cada uma pelo volume dela. Um letreiro é um quad por face,
 * e cada quad vira uma peça. Só a primeira primitiva: é o que o build grava
 * por material.
 *
 * ```ts
 * nodePieces(glb, nodesNamed(glb, 'letreiros-face')[0]) // um volume por face de letreiro
 * ```
 */
export function nodePieces(glb: PublishedGlb, node: GlbNode): readonly GameBounds[] {
  const vertices = nodeVertices(glb, node)
  const root = vertices.map((_, index) => index)
  const find = (index: number): number => {
    let at = index
    while (root[at] !== at) at = root[at] as number
    return at
  }
  const indices = triangleIndices(glb, node)
  for (let corner = 0; corner < indices.length; corner += 1) {
    root[find(indices[corner] as number)] = find(indices[corner - (corner % 3)] as number)
  }
  const pieces = new Map<number, number[][]>()
  for (const [index, vertex] of vertices.entries()) {
    const key = find(index)
    const piece = pieces.get(key) ?? []
    piece.push([...vertex])
    pieces.set(key, piece)
  }
  return [...pieces.values()].map(boundsOf)
}

function triangleIndices(glb: PublishedGlb, node: GlbNode): readonly number[] {
  const primitive = glb.json.meshes[node.mesh as number]?.primitives[0]
  const accessor = glb.json.accessors[primitive?.indices ?? -1]
  if (!accessor) throw new RangeError(`nó ${node.name} sem índices; esperado malha indexada`)
  const view = glb.json.bufferViews[accessor.bufferView]
  const wide = accessor.componentType === UNSIGNED_INT
  const start = (view?.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  return Array.from({ length: accessor.count }, (_, index) =>
    wide ? glb.bin.readUInt32LE(start + index * 4) : glb.bin.readUInt16LE(start + index * 2),
  )
}

function boundsOf(points: readonly number[][]): GameBounds {
  const axis = (pick: (values: number[]) => number, index: number) =>
    pick(points.map((point) => point[index] as number))
  const low = (index: number) => axis((values) => Math.min(...values), index)
  const high = (index: number) => axis((values) => Math.max(...values), index)
  return { min: [low(0), low(1), low(2)], max: [high(0), high(1), high(2)] }
}

function positionAccessors(glb: PublishedGlb, node: GlbNode): readonly GlbAccessor[] {
  const mesh =
    node.rotation === undefined && node.mesh !== undefined ? glb.json.meshes[node.mesh] : undefined
  if (!mesh) {
    throw new RangeError(
      `nó ${node.name} com malha ${node.mesh} e rotação ${node.rotation}; esperado malha existente e sem rotação`,
    )
  }
  return mesh.primitives.map(
    (primitive) => glb.json.accessors[primitive.attributes.POSITION] as GlbAccessor,
  )
}

/** Quem lê a componente `axis` do vértice `index`, com a vista e o passo resolvidos uma vez. */
function componentReader(
  glb: PublishedGlb,
  accessor: GlbAccessor,
): (index: number, axis: number) => number {
  const view = glb.json.bufferViews[accessor.bufferView]
  const size = accessor.componentType === FLOAT ? 4 : 2
  const stride = view?.byteStride ?? size * 3
  const start = (view?.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  if (accessor.componentType === FLOAT) {
    return (index, axis) => glb.bin.readFloatLE(start + index * stride + axis * size)
  }
  return (index, axis) => glb.bin.readInt16LE(start + index * stride + axis * size)
}

function decode(accessor: GlbAccessor, raw: number): number {
  if (accessor.componentType === FLOAT) return raw
  if (accessor.componentType === SHORT && accessor.normalized) return Math.max(raw / 32767, -1)
  throw new RangeError(
    `acessor de posição com componentType ${accessor.componentType}; esperado float ou short normalizado`,
  )
}

function placed(node: GlbNode, axis: number, local: number): number {
  return (node.translation?.[axis] ?? 0) + (node.scale?.[axis] ?? 1) * local
}

function toGame(low: readonly number[], high: readonly number[]): GameBounds {
  return {
    min: [-(high[0] as number), low[1] as number, low[2] as number],
    max: [-(low[0] as number), high[1] as number, high[2] as number],
  }
}
