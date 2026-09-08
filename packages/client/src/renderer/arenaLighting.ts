import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import { type ArenaLightingSpec, keyLightDirection } from './arenaLightingSpec.ts'

/**
 * Traduz `arenaLightingSpec.ts` para o babylon. Sem gerador de sombra de
 * propósito: sombra dinâmica é draw call extra por luz, e a ADR 0004 a proíbe
 * — quando a arena vier do blender, a sombra vem cozida no lightmap.
 *
 * Sem teste unitário: os testes rodam em node, sem webgl (adr 0001). O dado
 * que estas luzes consomem é testado em `arenaLightingSpec.test.ts`.
 *
 * ```ts
 * lightArena(scene, arenaLightingSpec())
 * ```
 */
export function lightArena(scene: Scene, spec: ArenaLightingSpec): void {
  scene.clearColor = new Color4(...spec.skyClearRgb, 1)
  createKeyLight(scene, spec)
  createFillLight(scene, spec)
}

function createKeyLight(scene: Scene, spec: ArenaLightingSpec): DirectionalLight {
  const key = new DirectionalLight('key', Vector3.FromArray([...keyLightDirection(spec)]), scene)
  key.intensity = spec.key.intensity
  key.diffuse = new Color3(...spec.key.colorRgb)
  // sem brilho especular: o material do greybox já zera a especular, e uma
  // luz que a devolve faz a face virada para ela estourar.
  key.specular = Color3.Black()
  return key
}

function createFillLight(scene: Scene, spec: ArenaLightingSpec): HemisphericLight {
  const fill = new HemisphericLight('fill', Vector3.Up(), scene)
  fill.intensity = spec.fill.intensity
  fill.diffuse = new Color3(...spec.fill.skyRgb)
  // groundColor não é decoração: sem ela a face de baixo de toda plataforma
  // fica preta, e plataforma sem silhueta é o que torna greybox ilegível.
  fill.groundColor = new Color3(...spec.fill.groundRgb)
  fill.specular = Color3.Black()
  return fill
}
