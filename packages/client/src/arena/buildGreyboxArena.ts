import { Vector4 } from '@babylonjs/core/Maths/math.vector'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import { createLayerMaterials } from '../renderer/greyboxMaterials.ts'
import { greyboxSurfaceSpec } from '../renderer/greyboxSurfaceSpec.ts'
import type { GreyboxBlock } from './greyboxBlockout.ts'
import { faceUvForBox } from './greyboxFaceUv.ts'

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
  const surfaces = greyboxSurfaceSpec()
  return blockout.map((block) => {
    const mesh = createBlockMesh(scene, block, surfaces[block.layer].metresPerTile)
    mesh.material = materials.get(block.layer) ?? null
    mesh.freezeWorldMatrix()
    return mesh
  })
}

/**
 * O `faceUV` é o que faz a textura ladrilhar no mesmo tamanho em metros no
 * piso de 64 m e na cobertura de 8 m — ver `greyboxFaceUv.ts` para por que o
 * uv, e não o `uScale` do material, é quem resolve isso.
 */
function createBlockMesh(scene: Scene, block: GreyboxBlock, metresPerTile: number): Mesh {
  const [width, height, depth] = block.sizeM
  const faceUV = faceUvForBox(block.sizeM, metresPerTile).map((face) => new Vector4(...face))
  const mesh = CreateBox(block.name, { width, height, depth, faceUV }, scene)
  mesh.position.set(...block.centerM)
  // sem `checkCollisions`: a colisão do jogador é do núcleo, contra as mesmas
  // caixas (`collisionBoxes.ts`), e a do babylon ficaria só custando quadro.
  return mesh
}
