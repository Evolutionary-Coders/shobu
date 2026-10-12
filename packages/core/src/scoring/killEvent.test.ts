import { describe, expect, it } from 'vitest'
import { createKillEvent, isHeadshotKill } from './killEvent.ts'

describe('isHeadshotKill', () => {
  it('vale da linha para cima, inclusive nela', () => {
    expect(isHeadshotKill({ hitHeightRatio: 0.82 }, 0.82)).toBe(true)
    expect(isHeadshotKill({ hitHeightRatio: 0.81 }, 0.82)).toBe(false)
  })

  it('o golpe de lâmina, que deixa a altura em zero, nunca é na cabeça', () => {
    expect(isHeadshotKill(createKillEvent(), 0.5)).toBe(false)
  })
})
