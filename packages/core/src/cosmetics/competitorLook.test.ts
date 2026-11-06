import { describe, expect, it } from 'vitest'
import {
  ACCENT_COUNT,
  botAccentOf,
  DEFAULT_HUMAN_SKIN,
  decodeHumanSkin,
  encodeHumanSkin,
  freeAccentOf,
  HUMAN_SKIN_IDS,
  isHumanSkin,
  isSniperFinishId,
  serverBotSkinOf,
} from './competitorLook.ts'

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

  it.each(HUMAN_SKIN_IDS)('round-trips %s through its code', (skin) => {
    expect(decodeHumanSkin(encodeHumanSkin(skin))).toBe(skin)
  })

  it.each([9, -1, 0.5, undefined])('falls back to the default skin for code %s', (code) => {
    expect(decodeHumanSkin(code)).toBe(DEFAULT_HUMAN_SKIN)
  })

  it.each([
    ['preta', true],
    ['grafite-neon', true],
    ['', false],
    ['<script>', false],
    ['GRAFITE', false],
    ['a'.repeat(33), false],
    [3, false],
  ])('tells whether %s is a sniper finish id', (candidate, expected) => {
    expect(isSniperFinishId(candidate)).toBe(expected)
  })
})

describe('freeAccentOf', () => {
  it('takes the lowest accent nobody uses', () => {
    expect(freeAccentOf([])).toBe(0)
    expect(freeAccentOf([0, 2])).toBe(1)
  })

  it('spreads the repeat by the count once every accent is taken', () => {
    expect(freeAccentOf([0, 1, 2])).toBe(0)
    expect(freeAccentOf([0, 1, 2, 0])).toBe(1)
  })
})

describe('server bot looks', () => {
  it('rotates the catalogue, the same on every call', () => {
    expect([0, 1, 2, 3, 4].map(serverBotSkinOf)).toEqual(['brick', 'vex', 'ronin', 'nova', 'brick'])
  })

  it('falls back to the default skin for an index outside the squad', () => {
    expect(serverBotSkinOf(-1)).toBe(DEFAULT_HUMAN_SKIN)
  })
})

describe('botAccentOf', () => {
  // validação de 05/11: o primeiro humano repetia o neon do bot 0.
  it('keeps every bot off the accent of a lone human', () => {
    const bots: number[] = []
    for (let index = 0; index < 3; index += 1) bots.push(botAccentOf([0], bots))
    expect(bots).not.toContain(0)
    expect(new Set(bots).size).toBe(ACCENT_COUNT - 1)
  })

  it('lets two bots share before a bot shares with a human', () => {
    expect(botAccentOf([0, 1], [2])).toBe(2)
  })

  it('repeats a human only once humans hold every accent', () => {
    expect(botAccentOf([0, 1, 2], [])).toBe(0)
    expect(botAccentOf([0, 1, 2, 0], [])).toBe(1)
  })

  it('takes the lowest accent in an empty room', () => {
    expect(botAccentOf([], [])).toBe(0)
  })
})
