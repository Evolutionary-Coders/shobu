import { describe, expect, it } from 'vitest'
import { AUDIO_CHANNELS, createSilentMixer } from './audioMixer.ts'

describe('AUDIO_CHANNELS', () => {
  it('são os três que o menu ajusta', () => {
    expect(AUDIO_CHANNELS).toEqual(['music', 'sfx', 'narrator'])
  })
})

describe('createSilentMixer', () => {
  it('aceita toda a interface sem fazer som nem lançar', () => {
    const mixer = createSilentMixer()
    expect(() => {
      mixer.unlock()
      mixer.setGain('sfx', 1)
      mixer.preload(['/assets/audio/sfx/reload.webm'])
      mixer.play('sfx', '/assets/audio/sfx/scope.webm')
      mixer.loop('passo', 'sfx', undefined)
      mixer.stream(undefined)
      mixer.speak('/assets/audio/voicelines/vega-pt-BR/intro-01.webm')
      mixer.dispose()
    }).not.toThrow()
  })
})
