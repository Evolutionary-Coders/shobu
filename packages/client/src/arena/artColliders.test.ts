import type { Vec3 } from '@shobu/core'
import {
  artCollidersFrom,
  COLLIDER_SHOT_AND_GRAPPLE,
  COLLIDER_SOLID,
  type RawArtCollider,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import ichibanGaiArt from '../../../core/src/arena/artColliders/ichiban-gai.json' with {
  type: 'json',
}
import neonKaidoArt from '../../../core/src/arena/artColliders/neon-kaido.json' with {
  type: 'json',
}
import { billboardColliders, signColliders } from './artColliderExtraction.ts'
import { nodesNamed, nodeVertices, readPublishedGlb } from './publishedArenaGlb.ts'

describe('artCollidersFrom', () => {
  const parapet = { name: 'platibanda', mask: 'solid', min: [0, 9, 0], max: [3, 9.9, 0.3] }

  it('traduz o nome da máscara para os bits do núcleo', () => {
    const [first, second] = artCollidersFrom([parapet, { ...parapet, mask: 'shotAndGrapple' }])
    expect(first?.mask).toBe(COLLIDER_SOLID)
    expect(second?.mask).toBe(COLLIDER_SHOT_AND_GRAPPLE)
    expect(first?.centerM).toEqual([1.5, 9.45, 0.15])
  })

  it('recusa máscara que não existe, com o nome da peça', () => {
    expect(() => artCollidersFrom([{ ...parapet, mask: 'tudo' }])).toThrow(
      /platibanda recebeu máscara tudo/,
    )
  })

  it('recusa nome herdado do protótipo como máscara', () => {
    for (const mask of ['toString', 'constructor', '__proto__']) {
      expect(() => artCollidersFrom([{ ...parapet, mask }])).toThrow(
        new RegExp(`platibanda recebeu máscara ${mask}`),
      )
    }
  })

  it('recusa canto que não tem três números', () => {
    expect(() => artCollidersFrom([{ ...parapet, min: [0, 9] }])).toThrow(/min \[0, 9\]/)
    expect(() => artCollidersFrom([{ ...parapet, max: [3, 9.9, 0.3, 1] }])).toThrow(/max \[/)
  })
})

/** Um índice de vértices por célula de 5 cm, para perguntar "há arte aqui?" sem varrer tudo. */
function vertexIndex(glbName: string, nodeNames: readonly string[]): Set<number> {
  const glb = readPublishedGlb(glbName)
  const index = new Set<number>()
  for (const name of nodeNames) {
    for (const node of nodesNamed(glb, name).filter((candidate) => candidate.name === name)) {
      for (const [x, y, z] of nodeVertices(glb, node)) index.add(cellKey(x, y, z))
    }
  }
  return index
}

/** A célula de 5 cm como número: 13 bits por eixo cobrem ±200 m. */
function cellKey(x: number, y: number, z: number): number {
  return cellOf(Math.floor(x * 20), Math.floor(y * 20), Math.floor(z * 20))
}

function cellOf(x: number, y: number, z: number): number {
  return ((x + 4096) * 8192 + (y + 4096)) * 8192 + (z + 4096)
}

/** Quantas células com vértice da arte há na caixa, com 5 cm de folga, até `enough`. */
function artCellsInside(
  index: Set<number>,
  min: readonly number[],
  max: readonly number[],
  enough: number,
): number {
  const [x0, y0, z0] = min.map((value) => Math.floor((value - 0.05) * 20)) as unknown as Vec3
  const [x1, y1, z1] = max.map((value) => Math.floor((value + 0.05) * 20)) as unknown as Vec3
  const [nx, ny, nz] = [x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1]
  let found = 0
  for (let cell = 0; cell < nx * ny * nz && found < enough; cell += 1) {
    const x = x0 + Math.floor(cell / (ny * nz))
    const y = y0 + (Math.floor(cell / nz) % ny)
    if (index.has(cellOf(x, y, z0 + (cell % nz)))) found += 1
  }
  return found
}

const fromBuild = (entries: readonly RawArtCollider[]) =>
  entries.filter((entry) => !/^(letreiro|telao)-/.test(entry.name))

describe.each([
  ['ichiban-gai.glb', ['arena-pele'], ichibanGaiArt.colliders],
  ['neon-kaido.glb', ['estatico', 'pele'], neonKaidoArt.colliders],
] as const)('a colisão da arte de %s', (glbName, meshes, colliders) => {
  const index = vertexIndex(glbName, meshes)

  /**
   * O que o gerador tira das funções do build tem de estar na arte publicada:
   * caixa sem vértice nenhum por perto é arte que mudou depois do json.
   */
  it.each(fromBuild(colliders).map((entry) => [entry.name, entry] as const))(
    '%s está em cima da arte',
    (_name, entry) => {
      expect(artCellsInside(index, entry.min, entry.max, 2)).toBeGreaterThanOrEqual(2)
    },
  )
})

describe('o letreiro e o telão do Neon-kaidō', () => {
  const glb = readPublishedGlb('neon-kaido.glb')

  it('são os que se leem hoje do glb publicado', () => {
    const fresh = [...signColliders(glb, 'letreiros-face'), ...billboardColliders(glb)]
    const stored = neonKaidoArt.colliders.filter((entry) => /^(letreiro|telao)-/.test(entry.name))
    expect(stored).toEqual(fresh)
  })

  it('o gerador recusa glb sem o nó das faces', () => {
    expect(() => signColliders(glb, 'nao-existe')).toThrow(/sem o nó nao-existe/)
  })
})
