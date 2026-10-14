import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup'
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer'
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader'
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import {
  COMPETITOR_IDLE_CLIP,
  competitorAvatarScale,
  competitorFeetM,
} from '../character/competitorAvatar.ts'
import type { CompetitorAccent } from '../character/competitorPalette.ts'
import { type HumanSkinId, humanSkinUrl } from '../character/humanSkins.ts'
import { downloadFraction } from '../loading/loadProgress.ts'
import { attachContactShadow } from './attachContactShadow.ts'
import { type CompetitorAnimator, createCompetitorAnimator } from './competitorAnimator.ts'
import { flattenPbrMaterial } from './flattenPbrMaterial.ts'
import { loadGltfPipeline } from './gltfPipeline.ts'
import { paintCompetitor } from './paintCompetitor.ts'

/**
 * Os 22 clipes, sem malha: servem a todo humano, e por isso descem uma vez só
 * (`scripts/convert-humans.mjs`). Conta nos cinco segundos do pilar 2 como o
 * js conta.
 */
const COMPETITOR_CLIPS_URL = '/assets/character/competitor-clips.glb'

export interface CompetitorAvatarOptions {
  /** Altura do olho, na convenção de `GREYBOX_SPAWN_POINTS_M`. */
  readonly eyeM: readonly [number, number, number]
  readonly capsuleHeightM: number
  /** A cor do neon deste competidor. Dois vizinhos nunca repetem. */
  readonly accent: CompetitorAccent
  /** Qual dos humanos ele veste (`humanSkins.ts`). */
  readonly skin: HumanSkinId
}

export interface CompetitorAvatar {
  readonly root: AbstractMesh
  /** Toca o clipe que o estado do jogador pede; começa em idle. */
  readonly animator: CompetitorAnimator
  /**
   * Os nós dos ossos deste clone, pelo nome do glb. É por eles que o rifle do
   * bot se apoia na mão e os braços seguram a arma (`botRifle.ts`).
   */
  readonly bones: ReadonlyMap<string, TransformNode>
  /** Os clipes deste clone: a pose de empunhar sai de um deles. */
  readonly clips: readonly AnimationGroup[]
}

export interface CompetitorLibrary {
  /** Um competidor novo na cena, saído do mesmo arquivo já carregado. */
  spawn(options: CompetitorAvatarOptions): Promise<CompetitorAvatar>
}

/**
 * Os clipes e cada humano baixados e lidos **uma vez**, e cada competidor
 * instanciado a partir deles. Antes de haver um arquivo compartilhado, cada
 * boneco chamava `ImportMeshAsync` do próprio: sete parses e sete conjuntos
 * de buffers na gpu, e os bonecos chegando um a um com a partida já rodando —
 * no wi-fi da feira, um quadro de ~470 ms nos primeiros segundos (medição de
 * 11/10).
 *
 * **Os clipes moram num arquivo, os humanos em outros**, e cada clone ganha
 * a própria cópia dos grupos de animação apontada para os ossos dele pelo
 * nome. Os quatro humanos têm os mesmos 65 ossos, com os ângulos de repouso
 * do Mannequin onde os clipes nasceram (`scripts/blender/build_humans.py`).
 *
 * O loader do glTF entra sob demanda por `gltfPipeline.ts`. As malhas com
 * esqueleto são clonadas pelo `instantiateModelsToScene`, cada uma com o
 * próprio esqueleto e o próprio animador.
 *
 * ```ts
 * const competitors = createCompetitorLibrary(scene, (fraction) => report('competidor', fraction))
 * await competitors.spawn({ eyeM: [0, 2, 0], capsuleHeightM: 2, accent: 'cyan', skin: 'vex' })
 * ```
 */
export function createCompetitorLibrary(
  scene: Scene,
  onProgress: (fraction: number) => void = () => {},
): CompetitorLibrary {
  const containers = new Map<string, Promise<AssetContainer>>()
  const fractions = new Map<string, number>()
  const reportFraction = (url: string, fraction: number) => {
    fractions.set(url, fraction)
    let sum = 0
    for (const value of fractions.values()) sum += value
    onProgress(sum / fractions.size)
  }
  const load = (url: string) => sharedContainer(scene, containers, url, reportFraction)
  return {
    spawn: async (options) => {
      const [clips, human] = await Promise.all([
        load(COMPETITOR_CLIPS_URL),
        load(humanSkinUrl(options.skin)),
      ])
      // os nomes ficam os do arquivo: os clipes se reapontam pelo nome do
      // osso, e o babylon aceita nome repetido entre clones.
      return dress(
        scene,
        human.instantiateModelsToScene((name) => name),
        clips,
        options,
      )
    },
  }
}

/** O container de um arquivo, baixado na primeira vez que alguém pede. */
function sharedContainer(
  scene: Scene,
  containers: Map<string, Promise<AssetContainer>>,
  url: string,
  onProgress: (url: string, fraction: number) => void,
): Promise<AssetContainer> {
  const known = containers.get(url)
  if (known) return known
  // a falha não fica guardada: o próximo competidor tenta de novo, como
  // cada um tentava por conta antes do arquivo compartilhado (revisão do #23).
  const loading = loadContainer(scene, url, (fraction) => onProgress(url, fraction)).catch(
    (reason: unknown) => {
      containers.delete(url)
      throw reason
    },
  )
  containers.set(url, loading)
  return loading
}

async function loadContainer(
  scene: Scene,
  url: string,
  onProgress: (fraction: number) => void,
): Promise<AssetContainer> {
  await loadGltfPipeline()
  const container = await LoadAssetContainerAsync(url, scene, {
    onProgress: (event) => onProgress(downloadFraction(event) ?? 0),
  })
  // o loader do glTF já põe o primeiro clipe para tocar, inclusive no
  // container: um grupo de animação em loop sobre nós que nem estão na cena,
  // pago todo quadro (revisão do #23). Quem anima são os clones.
  for (const group of container.animationGroups) group.stop()
  return container
}

/** Malha riggada, material achatado e o clipe de idle rodando, com o animador pronto. */
function dress(
  scene: Scene,
  entries: InstantiatedEntries,
  clips: AssetContainer,
  options: CompetitorAvatarOptions,
): CompetitorAvatar {
  const root = entries.rootNodes[0]
  if (!(root instanceof AbstractMesh)) {
    throw new Error(
      `${humanSkinUrl(options.skin)} instanciou ${entries.rootNodes.length} raízes; esperado o root do glb`,
    )
  }
  const meshes = [root, ...root.getChildMeshes(false)]
  root.position.set(...competitorFeetM(options.eyeM, options.capsuleHeightM))
  root.scaling.setAll(competitorAvatarScale(options.capsuleHeightM))
  for (const mesh of meshes) flattenPbrMaterial(mesh, scene, 'competitor')
  paintCompetitor(meshes, options.accent)
  attachContactShadow(scene, root)
  const bones = bonesByName(entries)
  const groups = clips.animationGroups.map((group) => retargetClip(group, bones))
  const animator = createCompetitorAnimator(groups, entries.skeletons)
  animator.play({ clip: COMPETITOR_IDLE_CLIP, loop: true, speedRatio: 1 }, 0)
  return { root, animator, bones, clips: groups }
}

/**
 * Uma cópia do clipe tocando nos ossos deste clone. As chaves não são
 * copiadas — as animações ficam compartilhadas com o arquivo de clipes —,
 * só o alvo de cada uma muda.
 */
function retargetClip(
  group: AnimationGroup,
  bones: ReadonlyMap<string, TransformNode>,
): AnimationGroup {
  return group.clone(group.name, (target: { name: string }) => {
    const bone = bones.get(target.name)
    if (bone) return bone
    throw new Error(
      `o clipe '${group.name}' anima o osso '${target.name}', que o humano não tem; esperado um dos ${bones.size} ossos da UAL`,
    )
  })
}

function bonesByName(entries: InstantiatedEntries): ReadonlyMap<string, TransformNode> {
  const bones = new Map<string, TransformNode>()
  for (const skeleton of entries.skeletons) {
    for (const bone of skeleton.bones) {
      const node = bone.getTransformNode()
      if (node) bones.set(node.name, node)
    }
  }
  return bones
}
