import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { LoadProgress } from '../loading/loadProgress.ts'
import { animateBillboards } from './animateBillboards.ts'
import type { ArenaRendererOptions } from './arenaRenderer.ts'
import { drawColliderOverlay } from './colliderOverlay.ts'
import { createOccluderWalls, type OccluderWalls } from './glowOccluders.ts'
import { loadArenaScenery } from './loadArenaScenery.ts'
import { glowNeon } from './neonGlow.ts'
import { greyboxFate } from './occluderPass.ts'
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
      if (neons) dressNightCity(scene, camera, neons, greybox)
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
 * telões, o reflexo da poça (desligado até a predefinição pedir) e o halo dos
 * neons, os dois últimos com o greybox de parede. No Ichiban-gai, que não tem
 * telão nem poça, os dois primeiros não fazem nada.
 */
function dressNightCity(
  scene: Scene,
  camera: UniversalCamera,
  neons: readonly AbstractMesh[],
  greybox: readonly Mesh[],
): void {
  animateBillboards(scene)
  const walls = createOccluderWalls(scene, greybox)
  const mirrored = attachPuddleMirror(scene, neons, walls)
  const glowing = glowNeon(scene, camera, neons, walls)
  retireGreybox(walls, glowing, mirrored)
}

/** Aplica `greyboxFate`: esconder é tirar de toda câmera, e o espelho ignora a máscara. */
function retireGreybox(walls: OccluderWalls, glowing: boolean, mirrored: boolean): void {
  const fate = greyboxFate(glowing, mirrored)
  if (fate === 'keep') return
  for (const box of walls.meshes) {
    if (fate === 'hide') box.layerMask = 0
    else box.dispose(false, true)
  }
}
