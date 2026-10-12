import { describe, expect, it } from 'vitest'
import {
  medalStingerUrl,
  musicUrl,
  NARRATOR_VOICE_LABELS,
  NARRATOR_VOICES,
  narratorVoiceAt,
  SFX_NAMES,
  sfxUrl,
  voicelineManifestUrl,
  voicelineUrl,
} from './soundCatalog.ts'

describe('soundCatalog', () => {
  it('o efeito sai da pasta convertida, em webm', () => {
    expect(sfxUrl('shot-sniper')).toBe('/assets/audio/sfx/shot-sniper.webm')
  })

  it('a música sai da pasta convertida, em webm', () => {
    expect(musicUrl('Chrome_Perimeter')).toBe('/assets/audio/music/Chrome_Perimeter.webm')
  })

  it('o manifesto da voz é o índice que o cliente lê', () => {
    expect(voicelineManifestUrl('vega-pt-BR')).toBe(
      '/assets/audio/voicelines/vega-pt-BR/manifest.json',
    )
  })

  it('o take vem do manifesto, e o cliente só junta a pasta', () => {
    expect(voicelineUrl('athena-pt-BR', 'double-kill-01.webm')).toBe(
      '/assets/audio/voicelines/athena-pt-BR/double-kill-01.webm',
    )
  })

  it('a medalha rara toca o segundo stinger', () => {
    expect(medalStingerUrl(true)).toContain('song-medal2')
    expect(medalStingerUrl(false)).toContain('song-medal.')
  })
})

describe('vozes do narrador', () => {
  it('o mestre da arena é o padrão, e é o primeiro da lista', () => {
    expect(NARRATOR_VOICES[0]).toBe('mestre-pt-BR')
    expect(narratorVoiceAt(0)).toBe('mestre-pt-BR')
  })

  it('as três personas abrem a lista, antes das vozes de rvc', () => {
    expect(NARRATOR_VOICES.slice(0, 3)).toEqual(['mestre-pt-BR', 'comandante-pt-BR', 'atlas-pt-BR'])
  })

  it('as vozes de antes seguem escolhíveis', () => {
    expect(NARRATOR_VOICES).toEqual(
      expect.arrayContaining(['vega-pt-BR', 'athena-pt-BR', 'ramattra-pt-BR', 'zenyatta-pt-BR']),
    )
  })

  it('tem um rótulo por voz', () => {
    expect(NARRATOR_VOICE_LABELS).toHaveLength(NARRATOR_VOICES.length)
  })

  it('o rótulo é o nome da pasta sem o locale, em caixa alta', () => {
    const esperados = NARRATOR_VOICES.map((voice) => voice.split('-')[0]?.toUpperCase())
    expect(NARRATOR_VOICE_LABELS).toEqual(esperados)
  })

  it.each([-1, 7, 1.5, Number.NaN])('índice %s cai no padrão em vez de quebrar', (index) => {
    expect(narratorVoiceAt(index)).toBe('mestre-pt-BR')
  })
})

describe('SFX_NAMES', () => {
  it('lista os efeitos que o jogo de fato toca', () => {
    expect(SFX_NAMES).toHaveLength(8)
  })

  /** A passada de andar saiu do take de correr desacelerado; o take próprio soava mal. */
  it('não pré-carrega o take de andar, que ninguém toca', () => {
    expect(SFX_NAMES).not.toContain('walking')
  })

  it('não repete nome', () => {
    expect(new Set(SFX_NAMES).size).toBe(SFX_NAMES.length)
  })
})
