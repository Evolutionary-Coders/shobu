import { describe, expect, it } from 'vitest'
import { createKillNotice } from '../controller/arenaFrameLog.ts'
import { distanceLabel, killCardHowLabel, killCardOf } from './killCards.ts'

describe('killCardOf', () => {
  it('junta o nome, o retrato, a arma, as marcas e a distância', () => {
    const kill = { ...createKillNotice(), headshot: true, scoped: true, distanceM: 86.6 }
    expect(killCardOf(kill, 'NEON KITSUNE', '/kitsune.webp')).toEqual({
      name: 'NEON KITSUNE',
      portraitUrl: '/kitsune.webp',
      weapon: 'sniper',
      tags: ['headshot', 'scoped'],
      distance: '87 M',
    })
  })

  it('sem retrato conhecido, o cartão sai sem ele', () => {
    expect(killCardOf(createKillNotice(), 'X', undefined).portraitUrl).toBeUndefined()
  })
})

describe('distanceLabel', () => {
  it('arredonda ao metro, e nunca fica negativa', () => {
    expect(distanceLabel(1.4)).toBe('1 M')
    expect(distanceLabel(-0.2)).toBe('0 M')
  })
})

describe('killCardHowLabel', () => {
  it('lê os ícones em palavras, com a distância no fim', () => {
    const kill = { ...createKillNotice(), weapon: 'katana' as const, victimAirborne: true }
    expect(killCardHowLabel(killCardOf({ ...kill, distanceM: 2 }, 'X', undefined))).toBe(
      'KATANA · NO AR · 2 M',
    )
  })
})
