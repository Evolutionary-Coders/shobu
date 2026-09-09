import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import {
  COMPETITOR_IDLE_CLIP,
  competitorAvatarScale,
  competitorFeetM,
} from '../character/competitorAvatar.ts'
import { type CompetitorAnimator, createCompetitorAnimator } from './competitorAnimator.ts'
import { flattenPbrMaterial } from './flattenPbrMaterial.ts'
import { loadGltfPipeline } from './gltfPipeline.ts'

/** Servido de `public/`; conta nos cinco segundos do pilar 2 como o js conta. */
const COMPETITOR_MODEL_URL = '/assets/character/competitor.glb'

export interface CompetitorAvatarOptions {
  /** Altura do olho, na convenção de `GREYBOX_SPAWN_POINTS_M`. */
  readonly eyeM: readonly [number, number, number]
  readonly capsuleHeightM: number
}

export interface CompetitorAvatar {
  readonly root: AbstractMesh
  /** Toca o clipe que o estado do jogador pede; começa em idle. */
  readonly animator: CompetitorAnimator
}

/**
 * Põe um competidor na cena: malha riggada, material achatado e o clipe de
 * idle rodando, com o animador pronto para trocar de clipe. O loader do glTF
 * entra sob demanda por `gltfPipeline.ts`.
 *
 * ```ts
 * await loadCompetitorAvatar(scene, { eyeM: [0, 1.8, 0], capsuleHeightM: 1.8 })
 * ```
 */
export async function loadCompetitorAvatar(
  scene: Scene,
  options: CompetitorAvatarOptions,
): Promise<CompetitorAvatar> {
  await loadGltfPipeline()
  const loaded = await ImportMeshAsync(COMPETITOR_MODEL_URL, scene)
  const root = loaded.meshes[0]
  if (!root) {
    throw new Error(`${COMPETITOR_MODEL_URL} carregou 0 malhas; esperado o root do glb`)
  }
  root.position.set(...competitorFeetM(options.eyeM, options.capsuleHeightM))
  root.scaling.setAll(competitorAvatarScale(options.capsuleHeightM))
  for (const mesh of loaded.meshes) flattenPbrMaterial(mesh, scene, 'competitor')
  const animator = createCompetitorAnimator(loaded.animationGroups, loaded.skeletons)
  animator.play({ clip: COMPETITOR_IDLE_CLIP, loop: true, speedRatio: 1 }, 0)
  return { root, animator }
}
