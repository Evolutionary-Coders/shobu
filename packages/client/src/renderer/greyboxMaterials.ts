import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
// sem estes dois, o babylon es6 busca o shader por url em tempo de execução,
// o vite devolve o index.html no lugar do .fx, e o efeito só compila por
// fallback degradado. importar estaticamente resolve o shader no bundle.
import '@babylonjs/core/Shaders/default.vertex'
import '@babylonjs/core/Shaders/default.fragment'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { Scene } from '@babylonjs/core/scene'
import { GRID_TILE_PX, type GreyboxGrid, paintGreyboxGrid } from '../arena/greyboxGrid.ts'
import { type GreyboxSurfaceLayer, greyboxSurfaceSpec } from './greyboxSurfaceSpec.ts'

/**
 * Um material por camada, com a grade de `greyboxGrid.ts` como difusa. Um por
 * camada e não um por bloco: todas as caixas de uma camada compartilham o
 * material congelado, e é isso que mantém o greybox em poucos draw calls.
 *
 * Sem teste unitário: os testes rodam em node, sem webgl (ADR 0001). O dado
 * que estes materiais consomem é testado em `greyboxSurfaceSpec.test.ts`.
 *
 * ```ts
 * const materials = createLayerMaterials(scene)
 * mesh.material = materials.get('floor') ?? null
 * ```
 */
export function createLayerMaterials(
  scene: Scene,
): ReadonlyMap<GreyboxSurfaceLayer, StandardMaterial> {
  const materials = new Map<GreyboxSurfaceLayer, StandardMaterial>()
  for (const [layer, grid] of Object.entries(greyboxSurfaceSpec())) {
    materials.set(layer as GreyboxSurfaceLayer, createGreyboxMaterial(scene, layer, grid))
  }
  return materials
}

function createGreyboxMaterial(scene: Scene, layer: string, grid: GreyboxGrid): StandardMaterial {
  const material = new StandardMaterial(`greybox-${layer}`, scene)
  material.diffuseTexture = createGridTexture(scene, layer, grid)
  // difusa branca: o tom da superfície já está pintado na grade, e multiplicar
  // de novo escureceria duas vezes.
  material.diffuseColor = Color3.White()
  material.specularColor = Color3.Black()
  material.freeze()
  return material
}

function createGridTexture(scene: Scene, layer: string, grid: GreyboxGrid): Texture {
  const texture = RawTexture.CreateRGBATexture(
    paintGreyboxGrid(grid),
    GRID_TILE_PX,
    GRID_TILE_PX,
    scene,
    true,
    false,
    // trilinear: linha fina de grade com nearest vira moiré a 20 m.
    Texture.TRILINEAR_SAMPLINGMODE,
  )
  texture.name = `greybox-${layer}-grid`
  // o ladrilho vem do uv de cada bloco (`greyboxFaceUv.ts`), não daqui: um
  // uScale no material valeria para todos os blocos da camada de uma vez.
  texture.wrapU = Texture.WRAP_ADDRESSMODE
  texture.wrapV = Texture.WRAP_ADDRESSMODE
  texture.anisotropicFilteringLevel = 8
  return texture
}
