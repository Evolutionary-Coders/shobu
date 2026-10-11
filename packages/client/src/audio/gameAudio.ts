import type { PlayerSettings } from '../settings/playerSettingsSpec.ts'
import type { AudioMixer } from './audioMixer.ts'
import type { Narrator } from './narrator.ts'
import { MATCH_MARK_PRIORITY } from './narratorQueue.ts'
import { narratorVoiceAt, SFX_NAMES, sfxUrl } from './soundCatalog.ts'
import { channelGain } from './volumeMix.ts'

/**
 * O áudio do jogo montado: mixer, narrador e a ligação com os ajustes do menu.
 *
 * **`unlock` sai de um gesto do jogador, e só de lá.** O `AudioContext` nasce
 * suspenso em todo navegador moderno, então chamar isto no fim do boot não
 * faria som nenhum sair — o primeiro comando do menu e o clique que entra na
 * arena são os dois gestos que valem, e por isso ele é idempotente.
 *
 * O mixer e o narrador entram por parâmetro, e não são construídos aqui: é o
 * que deixa este módulo — que é a política de quando cada coisa toca — ser
 * testado sem navegador, com os dois falsos.
 *
 * ```ts
 * const audio = createGameAudio(createWebAudioMixer(window), narrator)
 * audio.apply(store.read())
 * audio.unlock()
 * ```
 */
export interface GameAudio {
  readonly mixer: AudioMixer
  readonly narrator: Narrator
  unlock(): void
  /** Os três volumes e a voz. Chamado a cada ajuste do menu, e é barato. */
  apply(settings: Readonly<PlayerSettings>): void
}

export function createGameAudio(mixer: AudioMixer, narrator: Narrator): GameAudio {
  const state = { unlocked: false }
  return {
    mixer,
    narrator,
    unlock: () => {
      if (state.unlocked) return
      state.unlocked = true
      mixer.unlock()
      // 180 kB somados, e depois do gesto: o primeiro tiro da sessão não pode
      // esperar o download do próprio som.
      mixer.preload(SFX_NAMES.map(sfxUrl))
      // a apresentação do narrador é o que diz ao jogador que há voz no jogo,
      // e ela cabe no silêncio do menu.
      narrator.say('intro', MATCH_MARK_PRIORITY, 0)
    },
    apply: (settings) => {
      mixer.setGain('music', channelGain(settings.musicVolume))
      mixer.setGain('sfx', channelGain(settings.sfxVolume))
      mixer.setGain('narrator', channelGain(settings.narratorVolume))
      narrator.setVoice(narratorVoiceAt(settings.narratorVoice))
    },
  }
}
