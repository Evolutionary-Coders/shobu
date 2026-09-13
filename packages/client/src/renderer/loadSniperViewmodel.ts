import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup'
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Node } from '@babylonjs/core/node'
import type { Scene } from '@babylonjs/core/scene'
import { flattenPbrMaterial } from './flattenPbrMaterial.ts'
import { loadGltfPipeline } from './gltfPipeline.ts'
import {
  type ClipTempo,
  createViewmodelAnimator,
  type ViewmodelAnimator,
} from './viewmodelAnimator.ts'
import { maskAsViewmodel } from './viewmodelCamera.ts'

/** Servido de `public/`; é download sob demanda, fora do primeiro quadro. */
const VIEWMODEL_URL = '/assets/viewmodel/sniper.glb'

/** O clipe único do glb, com todas as poses concatenadas (`viewmodelClips.ts`). */
const ALLANIMS = 'allanims'

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
 * A arma na posição de quadril: corpo saindo pelo canto inferior direito, cano
 * apontando para o centro, luneta a 0,42 da meia-largura e 0,10 abaixo da
 * linha do horizonte, e o centro da tela livre para a mira.
 *
 * O ajuste original era para o fov de 120° do mundo, onde a arma parecia
 * largada — era o fov, não o deslocamento. Resolver o mesmo ponto de tela para
 * os 65° da câmera própria deixava a arma 2,7× maior, e na tela isso é luneta
 * tapando meio quadro: **o ponto de tela se conserva, o tamanho aparente não**,
 * porque a arma não encolhe junto com o frustum. O que decide o tamanho é a
 * distância, e é por isso que ela foi para 0,65 m do olho em vez de 0,34 m.
 *
 * `framePoint` em `viewmodelCamera.ts` é a conta que põe a luneta onde se quer;
 * o teste dela é a regressão de enquadramento.
 */
export const SNIPER_PLACEMENT: ViewmodelPlacement = {
  offsetM: [0.1306, -0.1902, 0.65],
  yawRad: -0.04,
  pitchRad: 0,
}

/**
 * A boca do cano, em metros no espaço do rig. Medido fatiando `base_sniper_0`
 * por z: o tubo do cano tem seção de 3,2 a 4,0 cm de z = 0,90 a 1,03, com o
 * eixo constante em y = 0,090, e a malha acaba em z = 1,026.
 *
 * É de onde o feixe do laser sai. O **raio** do hitscan sai do olho, não daqui:
 * é o olho que o servidor rebobina (ADR 0002), e um feixe que sai do cano e
 * termina no acerto do raio do olho é o que todo fps desenha.
 */
export const SNIPER_MUZZLE_M: readonly [number, number, number] = [0, 0.09, 1.026]

export interface SniperViewmodel {
  /** O nó que a câmera carrega: mover ou girar isto move a arma inteira. */
  readonly rig: TransformNode
  readonly root: AbstractMesh
  readonly animator: ViewmodelAnimator
  /**
   * A luneta engole a arma: desligar o rig tira a subárvore inteira do render,
   * que é mais barato que esconder malha por malha.
   */
  setVisible(visible: boolean): void
}

/**
 * Braços e arma em primeira pessoa, presos à câmera. É a metade FPP: o corpo
 * inteiro nunca é desenhado para quem está dentro dele.
 *
 * ```ts
 * const viewmodel = await loadSniperViewmodel(scene, camera, SNIPER_PLACEMENT, config.weapon)
 * viewmodel.animator.play('shoot')
 * ```
 */
export async function loadSniperViewmodel(
  scene: Scene,
  camera: Node,
  placement: ViewmodelPlacement,
  tempo: ClipTempo,
): Promise<SniperViewmodel> {
  await loadGltfPipeline()
  const loaded = await ImportMeshAsync(VIEWMODEL_URL, scene)
  const root = loaded.meshes[0]
  if (!root) throw new Error(`${VIEWMODEL_URL} carregou 0 malhas; esperado o root do glb`)
  const rig = createRig(scene, camera, placement)
  root.parent = rig
  // a máscara é o que mantém a arma fora da câmera do mundo: ela é desenhada
  // por uma câmera própria, num segundo passe com depth limpo, e por isso não
  // entra na parede quando o jogador encosta nela.
  maskAsViewmodel(loaded.meshes)
  for (const mesh of loaded.meshes) flattenPbrMaterial(mesh, scene, 'viewmodel')
  const group = requireAllanims(loaded.animationGroups)
  const animator = createViewmodelAnimator(group, tempo)
  return {
    rig,
    root,
    animator,
    setVisible: (visible) => rig.setEnabled(visible),
  }
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

function requireAllanims(groups: readonly AnimationGroup[]): AnimationGroup {
  // o loader começa a tocar o grupo inteiro sozinho; parar antes de escolher o intervalo.
  for (const group of groups) group.stop()
  const group = groups.find((candidate) => candidate.name === ALLANIMS)
  if (group) return group
  const names = groups.map((candidate) => candidate.name).join(', ')
  throw new Error(`o glb do viewmodel não tem o grupo '${ALLANIMS}'; tem [${names}]`)
}
