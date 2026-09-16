import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Scene } from '@babylonjs/core/scene'
import type { ArenaFogSpec } from '../arena/arenaFogSpec.ts'

/**
 * Traduz `arenaFogSpec.ts` para o babylon. Modo exponencial ao quadrado e não
 * linear: o linear precisa de um começo e de um fim escolhidos à mão, e os dois
 * seriam número inventado — o exponencial precisa só da densidade, que a
 * diagonal do piso deriva.
 *
 * Sem teste unitário: os testes rodam em node, sem webgl (ADR 0001). O dado
 * que esta função consome é testado em `arenaFogSpec.test.ts`.
 *
 * ```ts
 * fogArena(scene, arenaFogSpec())
 * ```
 */
export function fogArena(scene: Scene, spec: ArenaFogSpec): void {
  scene.fogMode = Scene.FOGMODE_EXP2
  scene.fogColor = new Color3(...spec.colorRgb)
  scene.fogDensity = spec.density
}
