import { describe, expect, it } from 'vitest'
import { createDeathCall, type LifeSituation } from './deathCall.ts'

const ALIVE: LifeSituation = { inArena: true, alive: true }
const DEAD: LifeSituation = { inArena: true, alive: false }

describe('createDeathCall', () => {
  it('cair na arena é a morte que o narrador comenta', () => {
    const deaths = createDeathCall()
    deaths.since(ALIVE)
    expect(deaths.since(DEAD)).toBe(true)
  })

  it('a queda sai uma vez só, e não a cada quadro no chão', () => {
    const deaths = createDeathCall()
    deaths.since(ALIVE)
    deaths.since(DEAD)
    expect(deaths.since(DEAD)).toBe(false)
  })

  it('renascer e cair de novo é outra morte', () => {
    const deaths = createDeathCall()
    for (const situation of [ALIVE, DEAD, ALIVE]) deaths.since(situation)
    expect(deaths.since(DEAD)).toBe(true)
  })

  it('o primeiro quadro, sem anterior, não é morte', () => {
    expect(createDeathCall().since(DEAD)).toBe(false)
  })

  it('sair para o menu não é morte', () => {
    const deaths = createDeathCall()
    deaths.since(ALIVE)
    expect(deaths.since({ inArena: false, alive: false })).toBe(false)
  })

  it('voltar do menu já no chão não é morte', () => {
    const deaths = createDeathCall()
    deaths.since(ALIVE)
    deaths.since({ inArena: false, alive: true })
    expect(deaths.since(DEAD)).toBe(false)
  })
})
