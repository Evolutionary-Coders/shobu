import { describe, expect, it } from 'vitest'
import { createUnlockedSession } from './unlockedSession.ts'

describe('createUnlockedSession', () => {
  it('começa fora da partida', () => {
    const session = createUnlockedSession()
    expect([session.active, session.input]).toEqual([false, undefined])
  })

  it('entra e sai, avisando quem escuta', () => {
    const session = createUnlockedSession()
    const seen: boolean[] = []
    session.onChange((active) => seen.push(active))
    session.enter('gamepad')
    expect([session.active, session.input]).toEqual([true, 'gamepad'])
    session.exit()
    expect(seen).toEqual([true, false])
  })

  it('entrar duas vezes avisa uma só', () => {
    const session = createUnlockedSession()
    const seen: boolean[] = []
    session.onChange((active) => seen.push(active))
    session.enter('touch')
    session.enter('touch')
    session.exit()
    session.exit()
    expect(seen).toEqual([true, false])
  })

  it('trocar de entrada no meio da partida avisa, sem sair (revisão do #21)', () => {
    const session = createUnlockedSession()
    const seen: boolean[] = []
    session.onChange((active) => seen.push(active))
    session.enter('touch')
    session.enter('gamepad')
    expect(seen).toEqual([true, true])
    expect(session.input).toBe('gamepad')
  })
})
