import type { ScorestreakNoticeKind, ScorestreakSlug } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { radarCalloutOf } from './radarCallout.ts'

function notice(
  playerId: string,
  scorestreak: ScorestreakSlug,
  kind: ScorestreakNoticeKind = 'activated',
) {
  return { kind, playerId, slot: 0, scorestreak }
}

describe('radarCalloutOf', () => {
  it('o PING próprio diz o que faz, e o de outro avisa que há um inimigo vendo', () => {
    expect(radarCalloutOf(notice('local', 'ping'))).toBe('PING ATIVO · INIMIGOS NO RADAR')
    expect(radarCalloutOf(notice('bot-0', 'ping'))).toBe('PING INIMIGO DETECTADO')
  })

  it('a série ganha e a série sem efeito no radar não chamam nada', () => {
    expect(radarCalloutOf(notice('local', 'ping', 'earned'))).toBeNull()
    expect(radarCalloutOf(notice('local', 'emp'))).toBeNull()
    expect(radarCalloutOf(notice('bot-0', 'counter-ping'))).toBeNull()
  })
})
