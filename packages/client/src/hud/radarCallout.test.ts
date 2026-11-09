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

  it('o ECO próprio diz se achou alvo, e o de outro só chama em quem ele marcou', () => {
    expect(radarCalloutOf({ ...notice('local', 'echo'), subjectId: 'bot-1' })).toBe(
      'ECO ATIVO · SEU ALVO NO RADAR',
    )
    expect(radarCalloutOf(notice('local', 'echo'))).toBe('ECO SEM ALVO')
    expect(radarCalloutOf({ ...notice('bot-0', 'echo'), subjectId: 'local' })).toBe(
      'ECO INIMIGO · VOCÊ ESTÁ MARCADO',
    )
    expect(radarCalloutOf({ ...notice('bot-0', 'echo'), subjectId: 'bot-1' })).toBeNull()
  })

  it('a série ganha e a série sem efeito no radar não chamam nada', () => {
    expect(radarCalloutOf(notice('local', 'ping', 'earned'))).toBeNull()
    expect(radarCalloutOf(notice('local', 'emp'))).toBeNull()
    expect(radarCalloutOf(notice('bot-0', 'counter-ping'))).toBeNull()
  })
})
