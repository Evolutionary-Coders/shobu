import type { Vector3, VoiceConfig } from '@shobu/core'

/**
 * Onde a voz acontece na arena: a boca de cada um que fala. O renderer escreve
 * a cada quadro, e o mixer põe cada voz no lugar (`AudioMixer.placeVoice`).
 * Quem ouve é o ouvido do mixer, que já segue a câmera.
 */
export interface VoiceStage {
  placeSpeaker(playerId: string, mouthM: Readonly<Vector3>): void
}

/**
 * A voz por proximidade, como o chat de proximidade do ARC Raiders: some com
 * a distância e vem da direção de quem fala. O `PannerNode` faz as duas
 * coisas: o modelo `linear` dá volume cheio até `refDistance` e silêncio a
 * partir de `maxDistance` (o inverso da distância, o padrão, nunca chega a
 * zero, e o outro lado da arena continuaria ouvindo), e o HRTF põe a voz à
 * esquerda, à direita, atrás ou acima, no fone.
 *
 * ```ts
 * const panner = new PannerNode(context, voicePannerOptions(config.voice))
 * ```
 */
export function voicePannerOptions(voice: VoiceConfig): PannerOptions {
  return {
    panningModel: 'HRTF',
    distanceModel: 'linear',
    refDistance: voice.fullVolumeRadiusM,
    maxDistance: voice.silentRadiusM,
    rolloffFactor: 1,
  }
}
