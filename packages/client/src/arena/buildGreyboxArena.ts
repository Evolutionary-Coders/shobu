import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import { createLayerMaterials } from '../renderer/greyboxMaterials.ts'
import type { GreyboxBlock } from './greyboxBlockout.ts'

/**
 * Instancia o blockout como caixas na cena. Toda malha tem matriz de mundo
 * congelada: a arena não se move durante a partida, e matriz congelada é uma
 * das quatro medidas de draw call que o nfr.md exige do babylon.
 *
 * ```ts
 * const meshes = buildGreyboxArena(scene, GREYBOX_BLOCKOUT)
 * ```
 */
export function buildGreyboxArena(
  scene: Scene,
  blockout: readonly GreyboxBlock[],
): readonly Mesh[] {
  if (blockout.length === 0) {
    throw new RangeError('blockout recebeu lista vazia; esperado ao menos um bloco de arena')
  }
  const materials = createLayerMaterials(scene)
  return blockout.map((block) => {
    const mesh = createBlockMesh(scene, block)
    mesh.material = materials.get(block.layer) ?? null
    mesh.freezeWorldMatrix()
    return mesh
  })
}

function createBlockMesh(scene: Scene, block: GreyboxBlock): Mesh {
  const [width, height, depth] = block.sizeM
  const mesh = CreateBox(block.name, { width, height, depth }, scene)
  mesh.position.set(...block.centerM)
  mesh.checkCollisions = true
  return mesh
}
