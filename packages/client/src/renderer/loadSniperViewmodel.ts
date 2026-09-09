import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup'
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Node } from '@babylonjs/core/node'
import type { Scene } from '@babylonjs/core/scene'
import {
  segmentFrames,
  VIEWMODEL_SEGMENTS,
  type ViewmodelClip,
} from '../character/viewmodelClips.ts'
import { flattenPbrMaterial } from './flattenPbrMaterial.ts'
import { loadGltfPipeline } from './gltfPipeline.ts'

/** Servido de `public/`; é download sob demanda, fora do primeiro quadro. */
const VIEWMODEL_URL = '/assets/viewmodel/sniper.glb'

/** O clipe único do glb, com todas as poses concatenadas (`viewmodelClips.ts`). */
const ALLANIMS = 'allanims'

/**
 * Grupo de render acima do mundo: o babylon limpa o depth entre grupos, então
 * a arma nunca entra na parede quando o jogador encosta nela — é o que todo fps
 * faz, com câmera separada ou com grupo, e grupo é o que custa menos aqui.
 */
const VIEWMODEL_RENDERING_GROUP = 1

/**
 * Onde a arma fica em relação ao olho, em metros no espaço da câmera: x para a
 * direita, y para cima, z para a frente. E o giro que alinha o cano com a
 * frente da câmera, porque o glb não nasceu apontando para +z.
 */
export interface ViewmodelPlacement {
  readonly offsetM: readonly [number, number, number]
  readonly yawRad: number
  readonly pitchRad: number
}

/**
 * Ajustado a olho na cena com o fov de 120°, na altura de arma do call of
 * duty: a luneta à direita do centro e um pouco acima da linha do horizonte,
 * o corpo da arma saindo pelo canto inferior direito, os dois braços no
 * quadro. Mais baixa e mais longe a arma encolhia e parecia largada.
 */
export const SNIPER_PLACEMENT: ViewmodelPlacement = {
  offsetM: [0.11, -0.15, 0.34],
  yawRad: -0.04,
  pitchRad: 0,
}

export interface SniperViewmodel {
  /** O nó que a câmera carrega: mover ou girar isto move a arma inteira. */
  readonly rig: TransformNode
  readonly root: AbstractMesh
  /** Toca um intervalo do `allanims`; o idle repete, os outros tocam uma vez. */
  play(clip: ViewmodelClip): void
}

/**
 * Braços e arma em primeira pessoa, presos à câmera. É a metade FPP: o corpo
 * inteiro nunca é desenhado para quem está dentro dele.
 *
 * ```ts
 * const viewmodel = await loadSniperViewmodel(scene, camera, SNIPER_PLACEMENT)
 * viewmodel.play('idle')
 * ```
 */
export async function loadSniperViewmodel(
  scene: Scene,
  camera: Node,
  placement: ViewmodelPlacement,
): Promise<SniperViewmodel> {
  await loadGltfPipeline()
  const loaded = await ImportMeshAsync(VIEWMODEL_URL, scene)
  const root = loaded.meshes[0]
  if (!root) throw new Error(`${VIEWMODEL_URL} carregou 0 malhas; esperado o root do glb`)
  const rig = createRig(scene, camera, placement)
  root.parent = rig
  for (const mesh of loaded.meshes) {
    mesh.renderingGroupId = VIEWMODEL_RENDERING_GROUP
    flattenPbrMaterial(mesh, scene, 'viewmodel')
  }
  const group = requireAllanims(loaded.animationGroups)
  const play = (clip: ViewmodelClip): void => playSegment(group, clip)
  play('idle')
  return { rig, root, play }
}

/**
 * Um nó entre a câmera e o `__root__` do glb, para o deslocamento e o giro
 * viverem separados do quaternion que o loader põe no root para trocar a mão
 * do sistema de coordenadas. Mexer direto no root perderia essa troca.
 */
function createRig(scene: Scene, camera: Node, placement: ViewmodelPlacement): TransformNode {
  const rig = new TransformNode('viewmodel-rig', scene)
  rig.parent = camera
  rig.position.set(...placement.offsetM)
  rig.rotation.set(placement.pitchRad, placement.yawRad, 0)
  return rig
}

function playSegment(group: AnimationGroup, clip: ViewmodelClip): void {
  const { from, to } = segmentFrames(clip)
  const segment = VIEWMODEL_SEGMENTS[clip]
  group.stop()
  group.start(segment.loop, segment.speedRatio, from, to)
}

function requireAllanims(groups: readonly AnimationGroup[]): AnimationGroup {
  // o loader começa a tocar o grupo inteiro sozinho; parar antes de escolher o intervalo.
  for (const group of groups) group.stop()
  const group = groups.find((candidate) => candidate.name === ALLANIMS)
  if (group) return group
  const names = groups.map((candidate) => candidate.name).join(', ')
  throw new Error(`o glb do viewmodel não tem o grupo '${ALLANIMS}'; tem [${names}]`)
}
