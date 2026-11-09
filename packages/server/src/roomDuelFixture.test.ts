import { describe, expect, it } from 'vitest'
import { duel, seat } from './roomDuelFixture.ts'

describe('seat, do duelo dos testes', () => {
  it('diz quem não está na sala, em vez de devolver undefined', () => {
    const { room } = duel()
    expect(() => seat(room, 'cia')).toThrow("'cia' fora da sala")
  })
})
