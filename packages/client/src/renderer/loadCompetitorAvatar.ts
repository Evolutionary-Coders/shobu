import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer'
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader'
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import {
  COMPETITOR_IDLE_CLIP,
  competitorAvatarScale,
  competitorFeetM,
} from '../character/competitorAvatar.ts'
import type { CompetitorAccent } from '../character/competitorPalette.ts'
import { downloadFraction } from '../loading/loadProgress.ts'
import { attachContactShadow } from './attachContactShadow.ts'
import { type CompetitorAnimator, createCompetitorAnimator } from './competitorAnimator.ts'
import { flattenPbrMaterial } from './flattenPbrMaterial.ts'
import { loadGltfPipeline } from './gltfPipeline.ts'
import { paintCompetitor } from './paintCompetitor.ts'

/** Servido de `public/`; conta nos cinco segundos do pilar 2 como o js conta. */
const COMPETITOR_MODEL_URL = '/assets/character/competitor.glb'

export interface CompetitorAvatarOptions {
  /** Altura do olho, na convenção de `GREYBOX_SPAWN_POINTS_M`. */
  readonly eyeM: readonly [number, number, number]
  readonly capsuleHeightM: number
  /** A cor das juntas deste competidor. Dois vizinhos nunca repetem. */
  readonly accent: CompetitorAccent
}

export interface CompetitorAvatar {
  readonly root: AbstractMesh
  /** Toca o clipe que o estado do jogador pede; começa em idle. */
  readonly animator: CompetitorAnimator
}

export interface CompetitorLibrary {
  /** Um competidor novo na cena, saído do mesmo arquivo já carregado. */
  spawn(options: CompetitorAvatarOptions): Promise<CompetitorAvatar>
}

/**
 * O `competitor.glb` baixado e lido **uma vez**, e cada competidor instanciado
 * a partir dele. Antes, cada boneco de treino e o avatar de revisão chamavam
 * `ImportMeshAsync` do mesmo arquivo: sete parses e sete conjuntos de buffers
 * na gpu, e os bonecos chegando um a um com a partida já rodando — no wi-fi da
 * feira, um quadro de ~470 ms nos primeiros segundos (medição de 11/10).
 *
 * O loader do glTF entra sob demanda por `gltfPipeline.ts`. As malhas com
 * esqueleto são clonadas pelo `instantiateModelsToScene`, cada uma com o
 * próprio esqueleto e o próprio animador.
 *
 * ```ts
 * const competitors = createCompetitorLibrary(scene, (fraction) => report('competidor', fraction))
 * await competitors.spawn({ eyeM: [0, 2, 0], capsuleHeightM: 2, accent: 'cyan' })
 * ```
 */
export function createCompetitorLibrary(
  scene: Scene,
  onProgress: (fraction: number) => void = () => {},
): CompetitorLibrary {
  let container: Promise<AssetContainer> | undefined
  return {
    spawn: async (options) => {
      // a falha não fica guardada: o próximo competidor tenta de novo, como
      // cada um tentava por conta antes do arquivo compartilhado (revisão do #23).
      container ??= loadContainer(scene, onProgress).catch((reason: unknown) => {
        container = undefined
        throw reason
      })
      // os nomes ficam os do arquivo: o animador acha os clipes pelo nome
      // (`competitorAnimator.ts`), e o babylon aceita nome repetido.
      return dress(
        scene,
        (await container).instantiateModelsToScene((name) => name),
        options,
      )
    },
  }
}

async function loadContainer(
  scene: Scene,
  onProgress: (fraction: number) => void,
): Promise<AssetContainer> {
  await loadGltfPipeline()
  const container = await LoadAssetContainerAsync(COMPETITOR_MODEL_URL, scene, {
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
  options: CompetitorAvatarOptions,
): CompetitorAvatar {
  const root = entries.rootNodes[0]
  if (!(root instanceof AbstractMesh)) {
    throw new Error(
      `${COMPETITOR_MODEL_URL} instanciou ${entries.rootNodes.length} raízes; esperado o root do glb`,
    )
  }
  const meshes = [root, ...root.getChildMeshes(false)]
  root.position.set(...competitorFeetM(options.eyeM, options.capsuleHeightM))
  root.scaling.setAll(competitorAvatarScale(options.capsuleHeightM))
  for (const mesh of meshes) flattenPbrMaterial(mesh, scene, 'competitor')
  paintCompetitor(meshes, options.accent)
  attachContactShadow(scene, root)
  const animator = createCompetitorAnimator(entries.animationGroups, entries.skeletons)
  animator.play({ clip: COMPETITOR_IDLE_CLIP, loop: true, speedRatio: 1 }, 0)
  return { root, animator }
}
