import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { MirrorTexture } from '@babylonjs/core/Materials/Textures/mirrorTexture'
import { Plane } from '@babylonjs/core/Maths/math.plane'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'

/** O chão molhado da rua depois da conversão de `loadArenaScenery.ts`. */
const WET_STREET_MATERIAL = 'cenario-sup-rua'
const MIRROR_NAME = 'poca-espelho'

/**
 * O reflexo dos letreiros na poça, só em QUALIDADE (`qualityPreset.ts`): um
 * `MirrorTexture` no plano do chão que desenha **só o neon que brilha** — os
 * letreiros e os telões, poucos draw calls —, a um quarto da resolução e
 * borrado, que é como poça reflete.
 *
 * Nasce desligado: quem liga e desliga é `setPuddleMirror`, chamado pelo
 * `applyQuality.ts` a cada troca de predefinição. Desligado, a textura sai do
 * material e o passe extra deixa de existir.
 *
 * ```ts
 * attachPuddleMirror(scene, glowingNeons)
 * ```
 */
export function attachPuddleMirror(scene: Scene, reflected: readonly AbstractMesh[]): void {
  if (!(scene.getMaterialByName(WET_STREET_MATERIAL) instanceof StandardMaterial)) return
  const mirror = new MirrorTexture(MIRROR_NAME, { ratio: 0.25 }, scene, true)
  mirror.mirrorPlane = new Plane(0, -1, 0, 0)
  mirror.renderList = [...reflected]
  mirror.adaptiveBlurKernel = 24
  // 0,35: a 0,55 a rua inteira virava espelho de plástico (captura de 11/10).
  mirror.level = 0.35
}

/**
 * Liga ou desliga o reflexo. Sem poça no mapa (Ichiban-gai), não faz nada.
 *
 * ```ts
 * setPuddleMirror(scene, level.puddleReflections)
 * ```
 */
export function setPuddleMirror(scene: Scene, enabled: boolean): void {
  const material = scene.getMaterialByName(WET_STREET_MATERIAL)
  const mirror = scene.getTextureByName(MIRROR_NAME)
  if (!(material instanceof StandardMaterial) || !(mirror instanceof MirrorTexture)) return
  const wanted = enabled ? mirror : null
  if (material.reflectionTexture === wanted) return
  material.unfreeze()
  material.reflectionTexture = wanted
  material.freeze()
}
