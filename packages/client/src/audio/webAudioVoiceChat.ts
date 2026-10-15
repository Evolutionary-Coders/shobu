import type { Vector3 } from '@shobu/core'
import { toWebAudioSpace } from './listenerSpace.ts'

/**
 * O chat de voz dentro do mixer: a faixa de cada jogador da sala passa por um
 * panner e pelo canal de voz, no mesmo `AudioContext` dos outros sons. É o que
 * deixa o ajuste do menu valer para ela, e o ouvido ser o mesmo dos efeitos
 * (`placeListener`), que já segue a câmera.
 *
 * As faixas chegam do servidor de mídia antes ou depois do `unlock`: ficam
 * guardadas aqui, e a corrente de nós de cada uma nasce no primeiro quadro em
 * que há saída e a boca dela é posta (`place`). Quem cria os nós é o mixer
 * (`openVoiceChain`), o adapter; aqui fica só a decisão.
 *
 * ```ts
 * const voices = createVoiceChat((out, track) => openVoiceChain(out, track, options))
 * voices.hear('sessao-da-ana', track)
 * voices.place(output, 'sessao-da-ana', mouthM)
 * ```
 */
export interface VoiceChat<Output> {
  hear(speakerId: string, track: MediaStreamTrack | undefined): void
  place(out: Output | undefined, speakerId: string, mouthM: Readonly<Vector3>): void
  /** A saída fechou: as correntes morreram com ela, e as faixas ficam. */
  forgetChains(): void
}

/** A corrente de uma voz: põe no ponto, já no espaço da Web Audio, e desliga. */
export interface VoiceChain {
  place(audioM: Readonly<Vector3>): void
  close(): void
}

export function createVoiceChat<Output>(
  openChain: (out: Output, track: MediaStreamTrack) => VoiceChain,
): VoiceChat<Output> {
  const tracks = new Map<string, MediaStreamTrack>()
  const chains = new Map<string, VoiceChain>()
  const scratch = { x: 0, y: 0, z: 0 }
  return {
    hear: (speakerId, track) => {
      chains.get(speakerId)?.close()
      chains.delete(speakerId)
      if (track) tracks.set(speakerId, track)
      else tracks.delete(speakerId)
    },
    place: (out, speakerId, mouthM) => {
      const track = tracks.get(speakerId)
      if (out === undefined || !track) return
      const chain = chains.get(speakerId) ?? openChain(out, track)
      chains.set(speakerId, chain)
      chain.place(toWebAudioSpace(mouthM, scratch))
    },
    forgetChains: () => chains.clear(),
  }
}
