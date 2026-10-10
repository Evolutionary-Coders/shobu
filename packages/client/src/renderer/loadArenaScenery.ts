import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { GreyboxBlock } from '../arena/arenaBlock.ts'
import {
  ARENA_SCENERY_DIR,
  ARENA_SCENERY_MANIFEST,
  type ArenaSceneryManifest,
  LIT_SKY_FILL,
  parseArenaSceneryManifest,
  type SceneryMaterialKind,
  sceneryMatchesLayout,
  sceneryMaterialKind,
} from '../arena/arenaScenery.ts'
import type { ArenaLoadTaskName } from '../loading/arenaLoadTasks.ts'
import { downloadFraction } from '../loading/loadProgress.ts'
import { loadGltfPipeline } from './gltfPipeline.ts'

/** Quem acompanha a carga: a tarefa e a fração dela, de 0 a 1. */
export type LoadReporter = (task: ArenaLoadTaskName, fraction: number) => void

/**
 * Troca o greybox pela arte do blender (ADR 0010): baixa o manifesto, confere
 * que a arte foi feita com o layout de agora, carrega o glb e o lightmap, e só
 * então esconde as caixas.
 *
 * Todo material vira `StandardMaterial` sem luz dinâmica: a cor chapada do
 * glb vai para a emissiva, e o lightmap multiplica por cima
 * (`useLightmapAsShadowmap`). O shader do babylon compõe
 * `clamp(emissiva) × lightmap`, que é exatamente `albedo × luz cozida`. O neon
 * fica só com a emissiva, e o fundo fora da arena usa a luz dinâmica — ver
 * `sceneryMaterialKind`.
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
  report: LoadReporter,
): Promise<void> {
  const manifest = await fetchManifest()
  if (!sceneryMatchesLayout(manifest, blockout)) {
    console.warn(
      JSON.stringify({ event: 'arena-scenery-stale', fingerprint: manifest.fingerprint }),
    )
    return
  }
  await loadGltfPipeline()
  const lightmap = createLightmap(scene, manifest, () => report('lightmap', 1))
  const loaded = await ImportMeshAsync(`${ARENA_SCENERY_DIR}${manifest.glb}`, scene, {
    onProgress: (event) => report('cenario', downloadFraction(event) ?? 0),
  })
  const converted = new Map<PBRMaterial, StandardMaterial>()
  for (const mesh of loaded.meshes) bakeIntoStandard(mesh, scene, lightmap, converted)
  // as texturas ficam: o material novo usa as mesmas (`applyDetailTexture`).
  for (const source of converted.keys()) source.dispose(false, false)
  // descartado, não só desligado: a arte não volta atrás, e o greybox
  // desligado seguia ocupando a memória da gpu (revisão do PR #16).
  for (const box of greybox) box.dispose(false, true)
}

async function fetchManifest(): Promise<ArenaSceneryManifest> {
  const url = `${ARENA_SCENERY_DIR}${ARENA_SCENERY_MANIFEST}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}; esperado 200`)
  return parseArenaSceneryManifest(await response.json())
}

function createLightmap(
  scene: Scene,
  manifest: ArenaSceneryManifest,
  settled: () => void,
): Texture {
  // invertY falso: a coordenada de uv do glb já vem na convenção do glTF, e o
  // carregador do babylon não a vira — quem vira é a textura, e esta não vem
  // pelo carregador.
  const lightmap = new Texture(`${ARENA_SCENERY_DIR}${manifest.lightmap}`, scene, {
    invertY: false,
    samplingMode: Texture.TRILINEAR_SAMPLINGMODE,
    // erro também conta como pronto: sem o lightmap a arte sai chapada, mas o
    // boot não pode ficar esperando um download que não vem.
    onLoad: settled,
    onError: settled,
  })
  // o uv 0 é o do ladrilho da textura de detalhe; o do lightmap é o 1
  // (`reset_uv_layers` em `scripts/blender/arena_bake.py`).
  lightmap.coordinatesIndex = 1
  lightmap.level = manifest.lightmapLevel
  return lightmap
}

/**
 * A textura de detalhe em cinza vai na difusa: com a luz desligada, o shader
 * faz `emissiva × difusa`, que é o `baseColorFactor × baseColorTexture` que o
 * glb carrega — cor da paleta vezes grão do material.
 */
function applyDetailTexture(material: StandardMaterial, source: PBRMaterial): void {
  const detail = source.albedoTexture
  if (!detail) return
  if (detail instanceof Texture) detail.anisotropicFilteringLevel = 8
  material.diffuseTexture = detail
}

/**
 * Um `StandardMaterial` por material do glTF, e não por malha: o glb tem 107
 * primitivas e 73 materiais, e converter por malha duplicava material e
 * shader (revisão do PR #16). `converted` é o cache, e no fim do laço é a
 * lista dos pbr que já podem ser descartados.
 */
function bakeIntoStandard(
  mesh: AbstractMesh,
  scene: Scene,
  lightmap: Texture,
  converted: Map<PBRMaterial, StandardMaterial>,
): void {
  mesh.isPickable = false
  mesh.freezeWorldMatrix()
  // instância do kit de prédios: o material é o da malha de origem, que este
  // mesmo laço já trocou; só a matriz é dela.
  if (mesh instanceof InstancedMesh) return
  const source = mesh.material
  if (!(source instanceof PBRMaterial)) return
  mesh.material = converted.get(source) ?? convert(source, scene, lightmap, converted)
}

function convert(
  source: PBRMaterial,
  scene: Scene,
  lightmap: Texture,
  converted: Map<PBRMaterial, StandardMaterial>,
): StandardMaterial {
  const material = new StandardMaterial(`cenario-${source.name}`, scene)
  material.specularColor = Color3.Black()
  paintByKind(material, source, sceneryMaterialKind(source.name), lightmap)
  material.freeze()
  converted.set(source, material)
  return material
}

function paintByKind(
  material: StandardMaterial,
  source: PBRMaterial,
  kind: SceneryMaterialKind,
  lightmap: Texture,
): void {
  // o glTF guarda cor em linear, e o StandardMaterial trabalha em gama.
  const albedo = source.albedoColor.toGammaSpace()
  if (kind === 'lit') {
    // o fundo é o kit de prédios: a cor está na textura cozida do arquivo, e a
    // cor do material só a multiplica (branca, na maioria das peças).
    material.diffuseColor = albedo
    material.diffuseTexture = source.albedoTexture
    material.emissiveColor = new Color3(LIT_SKY_FILL, LIT_SKY_FILL, LIT_SKY_FILL)
    return
  }
  material.disableLighting = true
  material.diffuseColor = Color3.Black()
  material.emissiveColor = kind === 'neon' ? source.emissiveColor.toGammaSpace() : albedo
  if (kind === 'neon') return
  material.lightmapTexture = lightmap
  material.useLightmapAsShadowmap = true
  applyDetailTexture(material, source)
}
