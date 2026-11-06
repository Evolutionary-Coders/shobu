import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'

/**
 * O greybox como parede do halo dos neons (`neonGlow.ts`): a arena em caixas tapa o que a arena tapa, em poucos
 * milhares de triângulos, em vez da cidade inteira desenhada de novo.
 */
export interface OccluderWalls {
  readonly meshes: readonly Mesh[]
  /** Verdadeiro para uma caixa do greybox. */
  has(mesh: AbstractMesh): boolean
  /** A parede passa a escrever profundidade: chamado ao entrar num passe de neon. */
  enterPass(): void
  /** A parede volta a não desenhar nada: chamado ao sair do passe. */
  leavePass(): void
}

/**
 * Troca o material do greybox por um que não escreve cor nunca, e
 * profundidade só durante os passes de neon.
 *
 * ```ts
 * const walls = createOccluderWalls(scene, greybox)
 * glowNeon(scene, camera, neons, walls)
 * ```
 */
export function createOccluderWalls(scene: Scene, greybox: readonly Mesh[]): OccluderWalls {
  const material = new StandardMaterial('glow-parede', scene)
  material.disableColorWrite = true
  material.disableDepthWrite = true
  const replaced = new Set(greybox.map((wall) => wall.material))
  for (const wall of greybox) wall.material = material
  // os materiais de camada do greybox só serviam às caixas: saem da gpu.
  for (const old of replaced) old?.dispose(false, true)
  const walls = new Set<AbstractMesh>(greybox)
  return {
    meshes: greybox,
    has: (mesh) => walls.has(mesh),
    enterPass: () => {
      material.disableDepthWrite = false
    },
    leavePass: () => {
      material.disableDepthWrite = true
    },
  }
}
