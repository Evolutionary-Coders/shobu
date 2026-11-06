import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { MirrorTexture } from '@babylonjs/core/Materials/Textures/mirrorTexture'
import { Plane } from '@babylonjs/core/Maths/math.plane'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { OccluderWalls } from './glowOccluders.ts'

/** O chão molhado da rua depois da conversão de `loadArenaScenery.ts`. */
const WET_STREET_MATERIAL = 'cenario-sup-rua'
const MIRROR_NAME = 'poca-espelho'

/**
 * O reflexo dos letreiros na poça, só em QUALIDADE (`qualityPreset.ts`): um
 * `MirrorTexture` no plano do chão que desenha **só o neon que brilha** — os
 * letreiros e os telões, poucos draw calls —, a um quarto da resolução e
 * borrado, que é como poça reflete.
 *
 * O greybox entra no reflexo como parede (`glowOccluders.ts`): preto, só
 * apaga o letreiro que está atrás de um prédio. Sem ele, a rua molhada
 * refletia placa e telão escondidos atrás das paredes — o neon atravessando a
 * parede, desenhado no chão.
 *
 * Nasce desligado: quem liga e desliga é `setPuddleMirror`, chamado pelo
 * `applyQuality.ts` a cada troca de predefinição. Desligado, a textura sai do
 * material e o passe extra deixa de existir.
 *
 * ```ts
 * attachPuddleMirror(scene, glowingNeons, walls) // false no mapa sem poça
 * ```
 */
export function attachPuddleMirror(
  scene: Scene,
  reflected: readonly AbstractMesh[],
  walls: OccluderWalls,
): boolean {
  if (!(scene.getMaterialByName(WET_STREET_MATERIAL) instanceof StandardMaterial)) return false
  const mirror = new MirrorTexture(MIRROR_NAME, { ratio: 0.25 }, scene, true)
  mirror.mirrorPlane = new Plane(0, -1, 0, 0)
  // o espelho desenha do fundo para a frente: parede só de profundidade não
  // taparia nada, por isso ela escreve preto o passe inteiro.
  mirror.renderList = [...walls.meshes, ...reflected]
  mirror.onBeforeRenderObservable.add(walls.enterPass)
  mirror.onAfterRenderObservable.add(walls.leavePass)
  mirror.adaptiveBlurKernel = 24
  // 0,35: a 0,55 a rua inteira virava espelho de plástico (captura de 11/10).
  mirror.level = 0.35
  return true
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
