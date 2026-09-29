import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { GreyboxBlock } from '../arena/arenaBlock.ts'
import {
  ARENA_SCENERY_DIR,
  ARENA_SCENERY_MANIFEST,
  type ArenaSceneryManifest,
  parseArenaSceneryManifest,
  sceneryMatchesLayout,
} from '../arena/arenaScenery.ts'
import { loadGltfPipeline } from './gltfPipeline.ts'

/**
 * Troca o greybox pela arte do blender (ADR 0010): baixa o manifesto, confere
 * que a arte foi feita com o layout de agora, carrega o glb e o lightmap, e só
 * então esconde as caixas.
 *
 * Todo material vira `StandardMaterial` sem luz dinâmica: a cor chapada do
 * glb vai para a emissiva, e o lightmap multiplica por cima
 * (`useLightmapAsShadowmap`). O shader do babylon compõe
 * `clamp(emissiva) × lightmap`, que é exatamente `albedo × luz cozida`. O neon
 * fica só com a emissiva, sem lightmap — ele é a luz, não o que a recebe.
 *
 * Sem teste unitário: fala com a rede e com a engine (ADR 0001). O manifesto
 * é testado em `arenaScenery.test.ts`.
 *
 * ```ts
 * await loadArenaScenery(scene, ICHIBAN_GAI_BLOCKOUT, greyboxMeshes)
 * ```
 */
export async function loadArenaScenery(
  scene: Scene,
  blockout: readonly GreyboxBlock[],
  greybox: readonly Mesh[],
): Promise<void> {
  const manifest = await fetchManifest()
  if (!sceneryMatchesLayout(manifest, blockout)) {
    console.warn(
      JSON.stringify({ event: 'arena-scenery-stale', fingerprint: manifest.fingerprint }),
    )
    return
  }
  await loadGltfPipeline()
  const loaded = await ImportMeshAsync(`${ARENA_SCENERY_DIR}${manifest.glb}`, scene)
  const lightmap = createLightmap(scene, manifest)
  for (const mesh of loaded.meshes) bakeIntoStandard(mesh, scene, lightmap)
  for (const box of greybox) box.setEnabled(false)
}

async function fetchManifest(): Promise<ArenaSceneryManifest> {
  const url = `${ARENA_SCENERY_DIR}${ARENA_SCENERY_MANIFEST}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}; esperado 200`)
  return parseArenaSceneryManifest(await response.json())
}

function createLightmap(scene: Scene, manifest: ArenaSceneryManifest): Texture {
  // invertY falso: a coordenada de uv do glb já vem na convenção do glTF, e o
  // carregador do babylon não a vira — quem vira é a textura, e esta não vem
  // pelo carregador.
  const lightmap = new Texture(`${ARENA_SCENERY_DIR}${manifest.lightmap}`, scene, {
    invertY: false,
    samplingMode: Texture.TRILINEAR_SAMPLINGMODE,
  })
  lightmap.coordinatesIndex = 0
  lightmap.level = manifest.lightmapLevel
  return lightmap
}

function bakeIntoStandard(mesh: AbstractMesh, scene: Scene, lightmap: Texture): void {
  const source = mesh.material
  if (!(source instanceof PBRMaterial)) return
  const material = new StandardMaterial(`cenario-${source.name}`, scene)
  material.disableLighting = true
  material.diffuseColor = Color3.Black()
  material.specularColor = Color3.Black()
  const isNeon = source.emissiveColor.toLuminance() > 0
  // o glTF guarda cor em linear, e o StandardMaterial trabalha em gama.
  material.emissiveColor = (isNeon ? source.emissiveColor : source.albedoColor).toGammaSpace()
  if (!isNeon) {
    material.lightmapTexture = lightmap
    material.useLightmapAsShadowmap = true
  }
  material.freeze()
  mesh.material = material
  mesh.isPickable = false
  mesh.freezeWorldMatrix()
}
