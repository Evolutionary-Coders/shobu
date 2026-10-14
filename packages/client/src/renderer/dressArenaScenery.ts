import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { LoadProgress } from '../loading/loadProgress.ts'
import { animateBillboards } from './animateBillboards.ts'
import type { ArenaRendererOptions } from './arenaRenderer.ts'
import { drawColliderOverlay } from './colliderOverlay.ts'
import { loadArenaScenery } from './loadArenaScenery.ts'
import { glowNeon } from './neonGlow.ts'
import { attachPuddleMirror } from './puddleMirror.ts'

/**
 * A arte do blender por cima do greybox. Sem `await`: a arena é jogável com as
 * caixas desde o primeiro quadro, e a colisão nunca dependeu deste download.
 * Se ele falhar — ou se a arte estiver desatualizada em relação ao layout —, o
 * jogador fica com o greybox, e cliente e servidor continuam simulando a mesma
 * coisa.
 *
 * `colliderReview` desenha as caixas de colisão por cima da arte
 * (`?perf=1&colisao=1`, `isColliderReview`). Chega pronto de quem chama, como
 * o `perf` do `attachFramePerf`: este módulo não lê a url.
 *
 * ```ts
 * dressWithScenery(scene, options.arena, buildGreyboxArena(scene, blockout), loading, camera, false)
 * ```
 */
export function dressWithScenery(
  scene: Scene,
  arena: ArenaRendererOptions['arena'],
  greybox: readonly Mesh[],
  loading: LoadProgress,
  camera: UniversalCamera,
  colliderReview: boolean,
): void {
  if (colliderReview) drawColliderOverlay(scene, arena)
  loadArenaScenery(scene, arena.blockout, arena.sceneryManifest, loading.report)
    .then((neons) => {
      decorateScenery(scene, neons)
      retireGreybox(scene, camera, neons, greybox)
    })
    .catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      console.error(JSON.stringify({ event: 'arena-scenery-load-failed', message }))
    })
    // pronto ou falho, a tarefa termina: arte desatualizada ou que não veio
    // deixa o greybox, e o boot não pode esperar por ela para sempre.
    .finally(() => {
      loading.finish('cenario')
      loading.finish('lightmap')
    })
}

/**
 * O que a arte do mapa noturno acrescenta depois de carregada: o rodízio dos
 * telões e o reflexo da poça (desligado até a predefinição pedir). No
 * Ichiban-gai, que não tem telão nem poça, os dois não fazem nada.
 */
function decorateScenery(scene: Scene, neons: readonly AbstractMesh[] | undefined): void {
  if (!neons) return
  animateBillboards(scene)
  attachPuddleMirror(scene, neons)
}

function retireGreybox(
  scene: Scene,
  camera: UniversalCamera,
  neons: readonly AbstractMesh[] | undefined,
  greybox: readonly Mesh[],
): void {
  if (!neons) return
  if (glowNeon(scene, camera, neons, greybox)) return
  for (const box of greybox) box.dispose(false, true)
}
