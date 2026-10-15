import { Constants } from '@babylonjs/core/Engines/constants'
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import { Material } from '@babylonjs/core/Materials/material'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { GreyboxBlock } from '@shobu/core'
import {
  ARENA_SCENERY_DIR,
  type ArenaSceneryManifest,
  LIT_SKY_FILL,
  parseArenaSceneryManifest,
  type SceneryMaterialKind,
  sceneryGlows,
  sceneryMatchesLayout,
  sceneryMaterialKind,
  sceneryMinAnisotropy,
} from '../arena/arenaScenery.ts'
import type { ArenaLoadTaskName } from '../loading/arenaLoadTasks.ts'
import { downloadFraction } from '../loading/loadProgress.ts'
import { loadGltfPipeline } from './gltfPipeline.ts'
import { bakeInstancesIntoThin } from './thinInstances.ts'

/** Quem acompanha a carga: a tarefa e a fração dela, de 0 a 1. */
export type LoadReporter = (task: ArenaLoadTaskName, fraction: number) => void

/**
 * Põe a arte do blender por cima do greybox (ADR 0010): baixa o manifesto,
 * confere que a arte foi feita com o layout de agora e carrega o glb e o
 * lightmap. O que fazer com as caixas depois é de quem chamou: elas podem
 * virar a parede do halo dos neons (`neonGlow.ts`).
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
 * Devolve as malhas de neon que brilham, para quem acende o halo: é aqui que o tipo de
 * cada material é decidido, e repetir a decisão lá fora seriam duas listas de
 * neon que divergem. `undefined` quer dizer que a arte **não entrou** (está
 * desatualizada), e o greybox continua sendo a arena.
 *
 * ```ts
 * const neons = await loadArenaScenery(scene, arena.blockout, arena.sceneryManifest, report)
 * ```
 */
export async function loadArenaScenery(
  scene: Scene,
  blockout: readonly GreyboxBlock[],
  manifestName: string,
  report: LoadReporter,
): Promise<readonly AbstractMesh[] | undefined> {
  const manifest = await fetchManifest(manifestName)
  if (!sceneryMatchesLayout(manifest, blockout)) {
    console.warn(
      JSON.stringify({ event: 'arena-scenery-stale', fingerprint: manifest.fingerprint }),
    )
    return undefined
  }
  await loadGltfPipeline()
  const lightmap = createLightmap(scene, manifest, () => report('lightmap', 1))
  const loaded = await ImportMeshAsync(`${ARENA_SCENERY_DIR}${manifest.glb}`, scene, {
    onProgress: (event) => report('cenario', downloadFraction(event) ?? 0),
  })
  const converted = new Map<PBRMaterial, StandardMaterial>()
  // só o neon que brilha volta: o fosco (janela, torre ao longe) fica fora do
  // halo e do reflexo da poça (`sceneryGlows`).
  const neons = loaded.meshes.filter((mesh) => {
    const sourceName = bakeIntoStandard(mesh, scene, lightmap, converted)
    return sourceName !== undefined && sceneryGlows(sourceName)
  })
  // as texturas ficam: o material novo usa as mesmas (`applyDetailTexture`).
  for (const source of converted.keys()) source.dispose(false, false)
  const thin = bakeInstancesIntoThin(loaded.meshes)
  console.info(JSON.stringify({ event: 'arena-instances-baked', thin }))
  return neons
}

async function fetchManifest(manifestName: string): Promise<ArenaSceneryManifest> {
  const url = `${ARENA_SCENERY_DIR}${manifestName}`
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
  if (detail instanceof Texture) {
    detail.anisotropicFilteringLevel = 8
    // o piso guarda o filtro mínimo dele: `applyQuality.ts` o respeita em DESEMPENHO.
    detail.metadata = { ...detail.metadata, minAnisotropy: sceneryMinAnisotropy(source.name) }
  }
  material.diffuseTexture = detail
}

/**
 * Um `StandardMaterial` por material do glTF, e não por malha: o glb tem 107
 * primitivas e 73 materiais, e converter por malha duplicava material e
 * shader (revisão do PR #16). `converted` é o cache, e no fim do laço é a
 * lista dos pbr que já podem ser descartados.
 *
 * Devolve o nome do material de origem da malha, ou `undefined` quando ela não
 * tem material próprio.
 */
function bakeIntoStandard(
  mesh: AbstractMesh,
  scene: Scene,
  lightmap: Texture,
  converted: Map<PBRMaterial, StandardMaterial>,
): string | undefined {
  mesh.isPickable = false
  mesh.freezeWorldMatrix()
  // o encardido do chão vem como `COLOR_0` de quatro canais, e o carregador
  // marca a malha como de alfa por vértice: ela ia para a fila transparente,
  // sem escrever profundidade. O alfa é sempre 1 (`neon_ground.py`).
  mesh.hasVertexAlpha = false
  // instância do kit de prédios: o material é o da malha de origem, que este
  // mesmo laço já trocou; só a matriz é dela.
  if (mesh instanceof InstancedMesh) return undefined
  const source = mesh.material
  if (!(source instanceof PBRMaterial)) return undefined
  mesh.material = converted.get(source) ?? convert(source, scene, lightmap, converted)
  return source.name
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
  if (kind === 'halo') {
    paintHalo(material, source)
    return
  }
  material.emissiveColor = kind === 'neon' ? source.emissiveColor.toGammaSpace() : albedo
  if (kind === 'neon') {
    paintNeonTexture(material, source)
    return
  }
  material.lightmapTexture = lightmap
  material.useLightmapAsShadowmap = true
  applyDetailTexture(material, source)
}

/**
 * Mistura aditiva: o preto da textura não soma nada, e o brilho clareia o que
 * está atrás. Sem escrita de profundidade, para um halo não recortar o outro.
 *
 * Sem névoa: a névoa do babylon puxa a cor **para** a cor dela, e num material
 * que soma isso vira um véu cinza no lugar do preto — a tela inteira clareava
 * onde houvesse cartão de halo.
 */
function paintHalo(material: StandardMaterial, source: PBRMaterial): void {
  paintNeonTexture(material, source)
  material.alphaMode = Constants.ALPHA_ADD
  material.transparencyMode = Material.MATERIAL_ALPHABLEND
  material.disableDepthWrite = true
  material.fogEnabled = false
}

/**
 * O letreiro do atlas: a cor está na textura. O shader padrão do babylon
 * **soma** a textura emissiva à cor emissiva — não multiplica —, então com
 * textura a cor tem que ser preta: com o fator branco do glTF, todo letreiro
 * e todo halo saía branco chapado (captura do look-dev, 11/10).
 */
function paintNeonTexture(material: StandardMaterial, source: PBRMaterial): void {
  if (!source.emissiveTexture) return
  material.emissiveTexture = source.emissiveTexture
  material.emissiveColor = Color3.Black()
}
