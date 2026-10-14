import type { Scene } from '@babylonjs/core/scene'
import type { GameplayConfig, StaticBox } from '@shobu/core'
import {
  createMuzzleFlash,
  type MuzzleFlash,
  type MuzzleFlashSize,
  muzzleFlashMaterial,
} from './muzzleFlashMesh.ts'
import { prefersReducedMotion } from './reducedMotion.ts'
import { flashIntensity } from './shotEffects.ts'
import { createShotVisuals, type ShotVisuals } from './shotVisuals.ts'
import { VIEWMODEL_LAYER } from './viewmodelCamera.ts'

/**
 * Os efeitos de tiro da arena, montados uma vez: o que o mundo desenha
 * (`ShotVisuals`), o clarão da arma do jogador e a fábrica dos clarões dos
 * bots, todos com **um material de clarão só**. Sem teste: é composição de
 * adapters (ADR 0001).
 *
 * ```ts
 * const effects = createArenaShotEffects(scene, config, boxes)
 * ```
 */
export interface ArenaShotEffects {
  readonly shots: ShotVisuals
  readonly playerFlash: MuzzleFlash
  readonly botFlash: (size: MuzzleFlashSize) => MuzzleFlash
}

/** Quantos feixes cabem vivos ao mesmo tempo: o jogador e os bots, com folga para dois tiros cada. */
const TRACER_POOL_SIZE = 8

/**
 * O clarão na arma, em metros do rig. Menor que o do bot: está a um metro do
 * olho, e o tamanho de tela é o que conta — este cobre a ponta do cano sem
 * apagar a mira.
 */
const PLAYER_FLASH_SIZE: MuzzleFlashSize = { starM: 0.26, lengthM: 0.5, widthM: 0.22 }

export function createArenaShotEffects(
  scene: Scene,
  config: GameplayConfig,
  boxes: readonly StaticBox[],
): ArenaShotEffects {
  const reducedMotion = prefersReducedMotion()
  const intensity = flashIntensity(reducedMotion)
  const material = muzzleFlashMaterial(scene)
  const playerFlash = createMuzzleFlash(scene, material, PLAYER_FLASH_SIZE, intensity)
  // da arma, e não do mundo: desenhado pela câmera dela, com o depth dela,
  // por cima do cano — e, no óculos, pelos olhos, que veem as duas camadas.
  playerFlash.mesh.layerMask = VIEWMODEL_LAYER
  return {
    shots: createShotVisuals(scene, {
      tracerPoolSize: TRACER_POOL_SIZE,
      tracerLifetimeS: config.weapon.tracerLifetimeS,
      boxes,
      eyeM: () => scene.activeCamera?.globalPosition,
      reducedMotion,
    }),
    playerFlash,
    botFlash: (size) => createMuzzleFlash(scene, material, size, intensity),
  }
}
