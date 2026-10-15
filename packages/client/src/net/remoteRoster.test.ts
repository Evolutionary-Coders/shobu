import { describe, expect, it } from 'vitest'
import { createRemoteRoster } from './remoteRoster.ts'

describe('createRemoteRoster', () => {
  it('avisa só na primeira vez que o jogador aparece', () => {
    const roster = createRemoteRoster()
    roster.beginFrame()
    expect(roster.visit('ana')).toBe(true)
    roster.endFrame()
    roster.beginFrame()
    expect(roster.visit('ana')).toBe(false)
  })

  it('devolve quem não apareceu no quadro', () => {
    const roster = createRemoteRoster()
    roster.beginFrame()
    roster.visit('ana')
    roster.visit('bia')
    roster.endFrame()
    roster.beginFrame()
    roster.visit('ana')
    expect(roster.endFrame()).toEqual(['bia'])
  })

  /** Quem sai e volta com o mesmo id é jogador novo: o avatar antigo já foi removido. */
  it('trata como novo quem saiu e voltou', () => {
    const roster = createRemoteRoster()
    roster.beginFrame()
    roster.visit('ana')
    roster.endFrame()
    roster.beginFrame()
    roster.endFrame()
    roster.beginFrame()
    expect(roster.visit('ana')).toBe(true)
  })
})
