import { describe, expect, it } from 'vitest'
import { DEFAULT_HUMAN_SKIN, HUMAN_SKIN_IDS, isHumanSkin } from './competitorLook.ts'

describe('competitorLook', () => {
  it('keeps the default skin in the catalogue', () => {
    expect(HUMAN_SKIN_IDS).toContain(DEFAULT_HUMAN_SKIN)
  })

  it.each([
    ['vex', true],
    ['nova', true],
    ['robo', false],
    [7, false],
    [undefined, false],
  ])('tells whether %s is a human skin', (candidate, expected) => {
    expect(isHumanSkin(candidate)).toBe(expected)
  })
})
