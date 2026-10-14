import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import type { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Texture as BabylonTexture } from '@babylonjs/core/Materials/Textures/texture'
import type { Scene } from '@babylonjs/core/scene'
import { BILLBOARD_OFFSETS, billboardStepAt } from '../arena/billboardCycle.ts'

/** O material dos telões depois da conversão de `loadArenaScenery.ts`. */
const BILLBOARD_MATERIAL = 'cenario-neon-teloes'

/** Seis segundos por anúncio: dá para ler, e o mapa nunca fica parado. */
const PERIOD_S = 6

/**
 * O rodízio dos telões (`billboardCycle.ts`): a cada período o uv do atlas de
 * anúncios anda uma célula, e todos os telões trocam juntos — cada um para um
 * anúncio diferente. Só escreve o deslocamento quando o passo muda.
 *
 * O material vem congelado da conversão; é descongelado aqui porque é o único
 * cujo uv muda depois de carregado.
 *
 * ```ts
 * animateBillboards(scene) // depois de loadArenaScenery
 * ```
 */
export function animateBillboards(scene: Scene): void {
  const material = scene.getMaterialByName(BILLBOARD_MATERIAL)
  if (!(material instanceof StandardMaterial) || !material.emissiveTexture) return
  const texture = material.emissiveTexture as Texture
  material.unfreeze()
  texture.wrapU = BabylonTexture.WRAP_ADDRESSMODE
  texture.wrapV = BabylonTexture.WRAP_ADDRESSMODE
  let shown = -1
  let elapsedS = 0
  scene.onBeforeRenderObservable.add(() => {
    elapsedS += scene.getEngine().getDeltaTime() / 1000
    const step = billboardStepAt(elapsedS, PERIOD_S)
    if (step === shown) return
    shown = step
    const [u, v] = BILLBOARD_OFFSETS[step] ?? [0, 0]
    texture.uOffset = u
    texture.vOffset = v
  })
}
