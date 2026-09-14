import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAYER_SETTINGS } from '../settings/playerSettingsSpec.ts'
import type { AudioChannel, AudioMixer } from './audioMixer.ts'
import { createGameAudio } from './gameAudio.ts'
import type { Narrator } from './narrator.ts'
import { NARRATOR_VOICES, SFX_NAMES } from './soundCatalog.ts'
import { channelGain } from './volumeMix.ts'

/** Anota o que o mixer recebeu, em vez de tocar. */
class FakeMixer implements AudioMixer {
  unlocks = 0
  readonly gains = new Map<AudioChannel, number>()
  readonly preloaded: string[] = []

  unlock(): void {
    this.unlocks += 1
  }

  setGain(channel: AudioChannel, gain: number): void {
    this.gains.set(channel, gain)
  }

  preload(urls: readonly string[]): void {
    this.preloaded.push(...urls)
  }

  play(): void {}
  loop(): void {}
  stream(): void {}
  speak(): void {}
  dispose(): void {}
}

class FakeNarrator implements Narrator {
  voice: string | undefined
  readonly said: string[] = []

  setVoice(voice: string): void {
    this.voice = voice
  }

  say(slug: string): void {
    this.said.push(slug)
  }
}

function mountAudio() {
  const mixer = new FakeMixer()
  const narrator = new FakeNarrator()
  return { mixer, narrator, audio: createGameAudio(mixer, narrator) }
}

describe('unlock', () => {
  it('destrava o mixer', () => {
    const { mixer, audio } = mountAudio()
    audio.unlock()
    expect(mixer.unlocks).toBe(1)
  })

  it('é idempotente: os dois gestos que o chamam podem acontecer', () => {
    const { mixer, audio } = mountAudio()
    audio.unlock()
    audio.unlock()
    expect(mixer.unlocks).toBe(1)
  })

  it('pré-carrega os nove efeitos, para o primeiro tiro não esperar', () => {
    const { mixer, audio } = mountAudio()
    audio.unlock()
    expect(mixer.preloaded).toHaveLength(SFX_NAMES.length)
  })

  it('apresenta o narrador, que é o que diz que há voz no jogo', () => {
    const { narrator, audio } = mountAudio()
    audio.unlock()
    expect(narrator.said).toEqual(['intro'])
  })

  it('não fala a apresentação duas vezes', () => {
    const { narrator, audio } = mountAudio()
    audio.unlock()
    audio.unlock()
    expect(narrator.said).toEqual(['intro'])
  })
})

describe('apply', () => {
  it('leva os três volumes do menu pela curva perceptual', () => {
    const { mixer, audio } = mountAudio()
    audio.apply(DEFAULT_PLAYER_SETTINGS)
    expect(mixer.gains.get('music')).toBe(channelGain(DEFAULT_PLAYER_SETTINGS.musicVolume))
    expect(mixer.gains.get('sfx')).toBe(channelGain(DEFAULT_PLAYER_SETTINGS.sfxVolume))
    expect(mixer.gains.get('narrator')).toBe(channelGain(DEFAULT_PLAYER_SETTINGS.narratorVolume))
  })

  it('o padrão é a vega', () => {
    const { narrator, audio } = mountAudio()
    audio.apply(DEFAULT_PLAYER_SETTINGS)
    expect(narrator.voice).toBe('vega-pt-BR')
  })

  it('troca a voz pelo índice do ajuste', () => {
    const { narrator, audio } = mountAudio()
    audio.apply({ ...DEFAULT_PLAYER_SETTINGS, narratorVoice: 3 })
    expect(narrator.voice).toBe(NARRATOR_VOICES[3])
  })

  it('o volume no zero é silêncio, e não o padrão', () => {
    const { mixer, audio } = mountAudio()
    audio.apply({ ...DEFAULT_PLAYER_SETTINGS, musicVolume: 0 })
    expect(mixer.gains.get('music')).toBe(0)
  })

  it('vale antes de destravar: o ganho pedido espera o gesto', () => {
    const { mixer, audio } = mountAudio()
    audio.apply({ ...DEFAULT_PLAYER_SETTINGS, sfxVolume: 100 })
    expect(mixer.gains.get('sfx')).toBe(1)
    expect(mixer.unlocks).toBe(0)
  })
})
