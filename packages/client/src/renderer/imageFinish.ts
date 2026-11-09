import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import type { Scene } from '@babylonjs/core/scene'

/**
 * O acabamento da imagem, no shader de cada material (playtest 09/11): a
 * vinheta, suave, para o olho ir ao centro, onde está a mira. A gradação de
 * cor continua no css do canvas (`hud.css`).
 *
 * **Sem tone mapping, de propósito.** O PBR Neutral foi ligado e tirado no
 * mesmo dia: a sombra de contato e o braço em primeira pessoa saíram com
 * pontos verdes, o sinal de material mandando valor fora da faixa para a
 * curva. Quem religar tem de olhar esses dois primeiro.
 */
export const IMAGE_FINISH = {
  vignetteWeight: 1.6,
  vignetteStretch: 0.4,
  vignetteColor: [0, 0, 0, 0] as const,
} as const

/**
 * Liga ou desliga o acabamento; quem decide é a predefinição de qualidade.
 *
 * ```ts
 * finishImage(scene, level.imageFinish)
 * ```
 */
export function finishImage(scene: Scene, enabled: boolean): void {
  const config = scene.imageProcessingConfiguration
  if (config.vignetteEnabled === enabled) return
  config.vignetteWeight = IMAGE_FINISH.vignetteWeight
  config.vignetteStretch = IMAGE_FINISH.vignetteStretch
  config.vignetteColor = new Color4(...IMAGE_FINISH.vignetteColor)
  config.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY
  config.vignetteEnabled = enabled
}
