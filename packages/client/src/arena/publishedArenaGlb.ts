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
    readonly primitives: readonly { readonly attributes: { readonly POSITION: number } }[]
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
  return positionAccessors(glb, node).flatMap((accessor) =>
    Array.from({ length: accessor.count }, (_, index) => {
      const [x, y, z] = [0, 1, 2].map((axis) =>
        placed(node, axis, decode(accessor, readComponent(glb, accessor, index, axis))),
      ) as [number, number, number]
      return [-x, y, z] as const
    }),
  )
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

function readComponent(
  glb: PublishedGlb,
  accessor: GlbAccessor,
  index: number,
  axis: number,
): number {
  const view = glb.json.bufferViews[accessor.bufferView]
  const size = accessor.componentType === FLOAT ? 4 : 2
  const stride = view?.byteStride ?? size * 3
  const at = (view?.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + index * stride + axis * size
  return accessor.componentType === FLOAT ? glb.bin.readFloatLE(at) : glb.bin.readInt16LE(at)
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
