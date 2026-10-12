/**
 * A colisão que se lê **direto do glb publicado**, para o que o build do
 * blender sorteia em sequência e nenhum outro lado consegue repetir: o
 * letreiro vertical e o telão do Neon-kaidō (ADR 0024). Quem chama é
 * `scripts/export-art-colliders.mjs`, que grava o resultado no json do mapa,
 * e o teste do mapa, que lê de novo e compara — se a arte for refeita, o json
 * velho reprova.
 *
 * Não roda no jogo: lê arquivo do disco.
 */
import type { Vec3 } from './arenaBlock.ts'
import type { ArtColliderEntry } from './artColliders.ts'
import {
  type GameBounds,
  nodePieces,
  nodesNamed,
  nodeVertices,
  type PublishedGlb,
} from './publishedArenaGlb.ts'

/** As duas faces de um letreiro ficam a `depth + 1 cm` uma da outra: 23 ou 41 cm. */
const SIGN_FACE_GAP_M = 0.5
/** O corpo do letreiro passa 4 cm da face para os lados e 8 cm para cima e para baixo. */
const SIGN_BODY_SIDE_M = 0.04
const SIGN_BODY_END_M = 0.08
/** O letreiro deitado tem uma face só; a caixa ganha 5 cm de cada lado dela. */
const LONE_FACE_DEPTH_M = 0.05
/** O telão é um quad inclinado: em fatias, a caixa de cada uma cobre pouco ar. */
const BILLBOARD_SLICES = 4

/**
 * Uma caixa por letreiro vertical, das duas faces de cada um, que tapa o tiro
 * e segura o gancho.
 *
 * ```ts
 * signColliders(readPublishedGlb('neon-kaido.glb'), 'letreiros-face')
 * ```
 */
export function signColliders(glb: PublishedGlb, nodeName: string): readonly ArtColliderEntry[] {
  const node = nodesNamed(glb, nodeName).find((candidate) => candidate.name === nodeName)
  if (!node) throw new RangeError(`glb sem o nó ${nodeName}; esperado o nó das faces de letreiro`)
  const signs = pairFaces(nodePieces(glb, node)).map(signBody)
  return sortedByPlace(signs).map((bounds, index) =>
    entry(`letreiro-${index}`, 'shotAndGrapple', bounds),
  )
}

/**
 * Cada telão (`telao-*`) em fatias, que tapam o tiro e seguram o gancho.
 *
 * ```ts
 * billboardColliders(readPublishedGlb('neon-kaido.glb'))
 * ```
 */
export function billboardColliders(glb: PublishedGlb): readonly ArtColliderEntry[] {
  return nodesNamed(glb, 'telao').flatMap((node) =>
    slicesOf(nodeVertices(glb, node)).map((bounds, slice) =>
      entry(`${node.name}-${slice}`, 'shotAndGrapple', bounds),
    ),
  )
}

/** O eixo em que a face não tem espessura: a normal dela. */
function normalAxisOf({ min, max }: GameBounds): 0 | 2 {
  return max[0] - min[0] < max[2] - min[2] ? 0 : 2
}

/** Junta as duas faces de cada letreiro: mesmo contorno, frente e verso a menos de meio metro. */
function pairFaces(faces: readonly GameBounds[]): readonly (readonly GameBounds[])[] {
  const groups = new Map<string, GameBounds[]>()
  for (const face of faces) {
    const key = outlineKey(face)
    groups.set(key, [...(groups.get(key) ?? []), face])
  }
  return [...groups.values()].flatMap(neighbourPairs)
}

function outlineKey(face: GameBounds): string {
  const normal = normalAxisOf(face)
  const side = normal === 0 ? 2 : 0
  const cm = (value: number) => Math.round(value * 100)
  return [normal, cm(face.min[side]), cm(face.max[side]), cm(face.min[1]), cm(face.max[1])].join()
}

/** As faces de mesmo contorno, em ordem ao longo da normal, emparelhadas com a vizinha perto. */
function neighbourPairs(faces: readonly GameBounds[]): readonly (readonly GameBounds[])[] {
  const normal = normalAxisOf(faces[0] as GameBounds)
  const sorted = [...faces].sort((a, b) => a.min[normal] - b.min[normal])
  const pairs: GameBounds[][] = []
  for (const face of sorted) {
    const last = pairs.at(-1)
    const partner = last?.length === 1 ? last[0] : undefined
    if (partner && face.min[normal] - partner.min[normal] <= SIGN_FACE_GAP_M) last?.push(face)
    else pairs.push([face])
  }
  return pairs
}

function signBody(faces: readonly GameBounds[]): GameBounds {
  const normal = normalAxisOf(faces[0] as GameBounds)
  const side = normal === 0 ? 2 : 0
  const pad = vec3((axis) => {
    if (axis === 1) return SIGN_BODY_END_M
    if (axis === side) return SIGN_BODY_SIDE_M
    return faces.length === 1 ? LONE_FACE_DEPTH_M : 0
  })
  return {
    min: vec3((axis) => Math.min(...faces.map((face) => face.min[axis])) - pad[axis]),
    max: vec3((axis) => Math.max(...faces.map((face) => face.max[axis])) + pad[axis]),
  }
}

/** Fatias verticais do quad, de um lado ao outro, cada uma com 5 cm de espessura a mais. */
function slicesOf(corners: readonly Vec3[]): readonly GameBounds[] {
  const byHeight = [...corners].sort((a, b) => a[1] - b[1])
  const [b0, b1] = alongPair(byHeight.slice(0, 2))
  const [t0, t1] = alongPair(byHeight.slice(2))
  return Array.from({ length: BILLBOARD_SLICES }, (_, slice) => {
    const from = slice / BILLBOARD_SLICES
    const to = (slice + 1) / BILLBOARD_SLICES
    const points = [lerp(b0, b1, from), lerp(b0, b1, to), lerp(t0, t1, from), lerp(t0, t1, to)]
    return padded(points, LONE_FACE_DEPTH_M)
  })
}

/** Os dois cantos de um lado do quad, do de menor x para o de maior: os dois lados no mesmo sentido. */
function alongPair(pair: readonly Vec3[]): readonly [Vec3, Vec3] {
  const [a, b] = [...pair].sort((first, second) => first[0] - second[0]) as [Vec3, Vec3]
  return [a, b]
}

function padded(points: readonly Vec3[], padM: number): GameBounds {
  const low = (axis: 0 | 1 | 2) => Math.min(...points.map((point) => point[axis]))
  const high = (axis: 0 | 1 | 2) => Math.max(...points.map((point) => point[axis]))
  return {
    min: [low(0) - padM, low(1), low(2) - padM],
    max: [high(0) + padM, high(1), high(2) + padM],
  }
}

function vec3(valueOn: (axis: 0 | 1 | 2) => number): Vec3 {
  return [valueOn(0), valueOn(1), valueOn(2)]
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Em ordem de lugar, para o nome de cada caixa não depender da ordem dos vértices no glb. */
function sortedByPlace(bounds: readonly GameBounds[]): readonly GameBounds[] {
  return [...bounds].sort(
    (a, b) => a.min[0] - b.min[0] || a.min[2] - b.min[2] || a.min[1] - b.min[1],
  )
}

/** Milímetro: a precisão com que o resto da arena é escrito, e o json fica legível. */
function entry(
  name: string,
  mask: ArtColliderEntry['mask'],
  { min, max }: GameBounds,
): ArtColliderEntry {
  const mm = (value: number) => Math.round(value * 1000) / 1000
  return { name, mask, min: vec3((axis) => mm(min[axis])), max: vec3((axis) => mm(max[axis])) }
}
