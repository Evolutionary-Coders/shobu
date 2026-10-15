import type { Material } from '@babylonjs/core/Materials/material'
import { Vector4 } from '@babylonjs/core/Maths/math.vector'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { GreyboxBlock } from '@shobu/core'
import { createLayerMaterials } from '../renderer/greyboxMaterials.ts'
import { greyboxSurfaceSpec } from '../renderer/greyboxSurfaceSpec.ts'
import { faceUvForBox } from './greyboxFaceUv.ts'

/**
 * Instancia o blockout como caixas na cena, **fundidas por camada**: uma malha
 * por material. Uma caixa por bloco eram ~515 draw calls (154 escadas, 248
 * ressaltos), pagas durante todo o boot e sempre que a arte falha — e o
 * celular esquentava justo quando a reserva era o que sobrava (revisão do PR
 * #16). Fundir não perde nada: a colisão é do núcleo, contra o blockout, e o
 * greybox é só imagem.
 *
 * Toda malha tem matriz de mundo congelada: a arena não se move durante a
 * partida, e matriz congelada é uma das medidas de draw call que o nfr.md
 * exige do babylon.
 *
 * ```ts
 * const meshes = buildGreyboxArena(scene, ICHIBAN_GAI_BLOCKOUT)
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
  const byLayer = new Map<GreyboxBlock['layer'], Mesh[]>()
  for (const block of blockout) {
    const mesh = createBlockMesh(scene, block, surfaces[block.layer].metresPerTile)
    const layer = byLayer.get(block.layer) ?? []
    layer.push(mesh)
    byLayer.set(block.layer, layer)
  }
  return [...byLayer].map(([layer, meshes]) => mergeLayer(meshes, materials.get(layer)))
}

function mergeLayer(meshes: Mesh[], material: Material | undefined): Mesh {
  // descarta as caixas de origem e aceita índice de 32 bits: o piso do bairro
  // inteiro numa camada passa dos 65 mil vértices.
  const merged = Mesh.MergeMeshes(meshes, true, true)
  if (!merged) {
    throw new Error(`MergeMeshes recusou ${meshes.length} caixas; esperado uma malha por camada`)
  }
  merged.material = material ?? null
  merged.freezeWorldMatrix()
  return merged
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
