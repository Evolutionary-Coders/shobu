import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup'
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import {
  COMPETITOR_IDLE_CLIP,
  competitorAvatarScale,
  competitorFeetM,
} from '../character/competitorAvatar.ts'

/** Servido de `public/`; conta nos cinco segundos do pilar 2 como o js conta. */
const COMPETITOR_MODEL_URL = '/assets/character/competitor.glb'

export interface CompetitorAvatarOptions {
  /** Altura do olho, na convenção de `GREYBOX_SPAWN_POINTS_M`. */
  readonly eyeM: readonly [number, number, number]
  readonly capsuleHeightM: number
}

/**
 * Põe um competidor na cena: malha riggada, material achatado e o clipe de
 * idle rodando.
 *
 * O loader do glTF entra por **import dinâmico** de propósito. Ele é o pedaço
 * mais gordo que o cliente tem depois do babylon, e o avatar não precisa
 * existir no primeiro quadro — o `measure-bundle` mostra isso como "sob
 * demanda", fora do caminho crítico do pilar 2.
 *
 * ```ts
 * await loadCompetitorAvatar(scene, { eyeM: [0, 1.8, 0], capsuleHeightM: 1.8 })
 * ```
 */
export async function loadCompetitorAvatar(
  scene: Scene,
  options: CompetitorAvatarOptions,
): Promise<void> {
  await loadGltfPipeline()
  const loaded = await ImportMeshAsync(COMPETITOR_MODEL_URL, scene)
  const root = loaded.meshes[0]
  if (!root) {
    throw new Error(`${COMPETITOR_MODEL_URL} carregou 0 malhas; esperado o root do glb`)
  }
  root.position.set(...competitorFeetM(options.eyeM, options.capsuleHeightM))
  root.scaling.setAll(competitorAvatarScale(options.capsuleHeightM))
  for (const mesh of loaded.meshes) dropPbrMaterial(mesh, scene)
  playIdleOnly(loaded.animationGroups)
}

/**
 * O loader e os dois shaders que ele puxa sem avisar, no mesmo salto para não
 * somar duas idas à rede.
 *
 * O glb chega com `PBRMaterial`, e o construtor do pbr decodifica a textura
 * brdf embutida com o efeito `postprocess` + `rgbdDecode`. Em es6 o babylon
 * busca esses shaders por url em tempo de execução, o vite devolve o
 * `index.html` no lugar do `.fx`, e o console enchia de `VERTEX SHADER ERROR:
 * '<'` a cada carregamento — o mesmo defeito que `greyboxMaterials.ts` já
 * corrige para o shader default. Importar estaticamente resolve no bundle.
 */
async function loadGltfPipeline(): Promise<void> {
  await Promise.all([
    import('@babylonjs/loaders/glTF/2.0'),
    import('@babylonjs/core/Shaders/postprocess.vertex'),
    import('@babylonjs/core/Shaders/rgbdDecode.fragment'),
  ])
}

/**
 * A ADR 0004 proíbe pbr: o glb vem com `PBRMaterial` por cor de base, sem
 * textura e sem `metallicRoughness`, então trocar por `StandardMaterial`
 * preserva a aparência inteira e sai do caminho de iluminação caro.
 *
 * Cada avatar carregado cria os próprios materiais. Com oito competidores isso
 * é material duplicado por jogador, e a saída é malha instanciada com esqueleto
 * compartilhado — problema do multiplayer (ADR 0002), não deste carregamento.
 */
function dropPbrMaterial(mesh: AbstractMesh, scene: Scene): void {
  const source = mesh.material
  if (!(source instanceof PBRMaterial)) return
  const flat = new StandardMaterial(`competitor-${source.name}`, scene)
  flat.diffuseColor = source.albedoColor.clone()
  flat.specularColor = Color3.Black()
  flat.freeze()
  mesh.material = flat
}

/** O loader do glTF começa a tocar o primeiro grupo sozinho; aqui manda o quê. */
function playIdleOnly(groups: readonly AnimationGroup[]): void {
  for (const group of groups) group.stop()
  const idle = groups.find((group) => group.name === COMPETITOR_IDLE_CLIP)
  if (!idle) {
    const names = groups.map((group) => group.name).join(', ')
    throw new Error(`o glb não tem o grupo '${COMPETITOR_IDLE_CLIP}'; tem [${names}]`)
  }
  idle.play(true)
}
