import { describe, expect, it } from 'vitest'
import { createGamepadSession } from './gamepadSession.ts'

describe('createGamepadSession', () => {
  it('começa fora da partida', () => {
    expect(createGamepadSession().active).toBe(false)
  })

  it('entra e sai, avisando quem escuta', () => {
    const session = createGamepadSession()
    const seen: boolean[] = []
    session.onChange((active) => seen.push(active))
    session.enter()
    expect(session.active).toBe(true)
    session.exit()
    expect(seen).toEqual([true, false])
  })

  it('entrar duas vezes avisa uma só', () => {
    const session = createGamepadSession()
    const seen: boolean[] = []
    session.onChange((active) => seen.push(active))
    session.enter()
    session.enter()
    session.exit()
    session.exit()
    expect(seen).toEqual([true, false])
  })
})
