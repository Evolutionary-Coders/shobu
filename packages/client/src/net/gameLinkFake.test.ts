import { describe, expect, it } from 'vitest'
import { FakeGameLink } from './gameLinkFake.ts'

describe('FakeGameLink', () => {
  /** A sala de teste não guarda aviso para quem ainda não ouve: como o colyseus. */
  it('fala sem ninguém ouvindo, e sai ou cai sem efeito', async () => {
    const link = new FakeGameLink()
    link.confirmKill('bot-0')
    link.onMove()
    link.onVoiceTicket()
    await expect(link.leave()).resolves.toBeUndefined()
    await expect(link.drop()).resolves.toBeUndefined()
    expect(link.sent).toEqual([])
  })
})
