import { describe, expect, it } from 'vitest'
import type { MedalAward } from '../medals/awardMedals.ts'
import { medalBySlug } from '../medals/medalCatalog.ts'
import { type RoomMedal, roomMedalAwards, roomMedalsOf } from './roomKillMedals.ts'

describe('roomMedalAwards', () => {
  it('sem medalhas no fio é servidor antigo: devolve false e não mexe na lista', () => {
    const into: MedalAward[] = []
    expect(roomMedalAwards(undefined, into)).toBe(false)
    expect(into).toEqual([])
  })

  it('uma lista vazia é a sala dizendo que não houve medalha', () => {
    const into: MedalAward[] = []
    expect(roomMedalAwards([], into)).toBe(true)
    expect(into).toEqual([])
  })

  it('volta cada slug para a medalha do catálogo, com os pontos da sala, no fim da lista', () => {
    const before = { medal: medalBySlug('knife'), points: 25 }
    const into: MedalAward[] = [before]
    roomMedalAwards([{ slug: 'first-blood', points: 50 }], into)
    expect(into).toEqual([before, { medal: medalBySlug('first-blood'), points: 50 }])
  })

  it('um slug que o cliente não conhece fica de fora em vez de lançar', () => {
    const into: MedalAward[] = []
    const unknown = { slug: 'nuke', points: 999 } as unknown as RoomMedal
    expect(roomMedalAwards([unknown, { slug: 'headshot', points: 50 }], into)).toBe(true)
    expect(into.map((award) => award.medal.slug)).toEqual(['headshot'])
  })
})

describe('roomMedalsOf', () => {
  it('ida e volta pelo fio dá as mesmas medalhas', () => {
    const awards: MedalAward[] = [
      { medal: medalBySlug('double-kill'), points: 50 },
      { medal: medalBySlug('headshot'), points: 50 },
    ]
    const back: MedalAward[] = []
    roomMedalAwards(roomMedalsOf(awards), back)
    expect(back).toEqual(awards)
  })
})
