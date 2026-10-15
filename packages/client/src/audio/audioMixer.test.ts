import { describe, expect, it } from 'vitest'
import { AUDIO_CHANNELS, createSilentMixer } from './audioMixer.ts'

describe('AUDIO_CHANNELS', () => {
  it('são os quatro que o menu ajusta', () => {
    expect(AUDIO_CHANNELS).toEqual(['music', 'sfx', 'narrator', 'voice'])
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
      mixer.placeListener({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 0, z: 1 })
      mixer.playAt('/assets/audio/sfx/shot-sniper.webm', { x: 5, y: 1, z: 0 }, 0.5)
      mixer.loopAt('passo-bot-0', undefined, { x: 5, y: 0, z: 0 }, 0)
      mixer.stream(undefined)
      mixer.speak('/assets/audio/voicelines/vega-pt-BR/intro-01.webm')
      mixer.hearVoice('ana', undefined)
      mixer.placeVoice('ana', { x: 0, y: 1.7, z: 5 })
      mixer.dispose()
    }).not.toThrow()
  })
})
