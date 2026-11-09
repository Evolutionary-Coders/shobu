import { describe, expect, it } from 'vitest'
import { radarVoiceOf } from './radarVoice.ts'

describe('radarVoiceOf', () => {
  it('o PING próprio e o de outro têm falas diferentes', () => {
    expect(
      radarVoiceOf({ kind: 'activated', playerId: 'local', slot: 0, scorestreak: 'ping' }),
    ).toBe('scorestreak-ping')
    expect(
      radarVoiceOf({ kind: 'activated', playerId: 'bot-1', slot: 2, scorestreak: 'ping' }),
    ).toBe('enemy-ping')
  })

  it('a série ganha e outra série não falam nada', () => {
    expect(
      radarVoiceOf({ kind: 'earned', playerId: 'local', slot: 0, scorestreak: 'ping' }),
    ).toBeUndefined()
    expect(
      radarVoiceOf({ kind: 'activated', playerId: 'local', slot: 0, scorestreak: 'sonar' }),
    ).toBeUndefined()
  })
})
