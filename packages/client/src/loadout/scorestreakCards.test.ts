import { existsSync } from 'node:fs'
import { SCORESTREAK_CATALOG } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { config } from '../controller/arenaSessionTestKit.ts'
import {
  scorestreakCardStatus,
  scorestreakCardsOf,
  scorestreakIconUrl,
} from './scorestreakCards.ts'
import { parseScorestreakChoice, type ScorestreakChoice } from './scorestreakLoadout.ts'

const PUBLIC_DIR = new URL('../../public/', import.meta.url)

/** ECO, SONAR e PULSO EMP: uma de cada peso, fora da ordem do catálogo. */
const CHOICE: ScorestreakChoice = { first: 6, second: 0, third: 10 }

describe('scorestreakIconUrl', () => {
  it.each(SCORESTREAK_CATALOG)('$slug aponta para um svg que o public serve', ({ slug }) => {
    expect(existsSync(new URL(`.${scorestreakIconUrl(slug)}`, PUBLIC_DIR))).toBe(true)
  })
})

describe('scorestreakCardsOf', () => {
  it('um cartão por série, na ordem do catálogo, com o custo do config', () => {
    const cards = scorestreakCardsOf(parseScorestreakChoice(null), 0, config.scorestreaks)
    expect(cards.map((card) => card.slug)).toEqual(SCORESTREAK_CATALOG.map((s) => s.slug))
    expect(cards[2]).toEqual({
      slug: 'ping',
      label: 'PING',
      tier: 'leve',
      cost: config.scorestreaks.pingCost,
      iconUrl: '/assets/images/scorestreaks/ping.svg',
      slot: 0,
      focused: true,
      blurb: 'VARRE OS INIMIGOS NO MINIMAPA A CADA 3 s, POR 15 s.',
      live: true,
      available: true,
    })
  })

  it('as bloqueadas saem na grade, marcadas, e fora da escolha', () => {
    const cards = scorestreakCardsOf(parseScorestreakChoice(null), 0, config.scorestreaks)
    const locked = cards.filter((card) => !card.available)
    expect(locked.map((card) => card.slug)).toEqual(
      SCORESTREAK_CATALOG.filter((streak) => !streak.available).map((streak) => streak.slug),
    )
    expect(locked.every((card) => card.slot === null && !card.focused)).toBe(true)
  })

  it('só as séries com efeito saem sem EM BREVE', () => {
    const cards = scorestreakCardsOf(parseScorestreakChoice(null), 0, config.scorestreaks)
    expect(cards.filter((card) => card.live).map((card) => card.slug)).toEqual([
      'grapple-overclock',
      'ping',
      'counter-ping',
      'rapid-bolt',
      'sonar',
    ])
  })

  it.each(SCORESTREAK_CATALOG)('$slug tem uma linha que cabe no menu', ({ slug }) => {
    const card = scorestreakCardsOf(parseScorestreakChoice(null), 0, config.scorestreaks).find(
      (each) => each.slug === slug,
    )
    expect(card?.blurb.length).toBeGreaterThan(0)
    expect(card?.blurb.length).toBeLessThanOrEqual(60)
  })

  it('cada série escolhida diz a linha que a leva; as outras, nenhuma', () => {
    const cards = scorestreakCardsOf(CHOICE, 0, config.scorestreaks)
    const slots = cards.flatMap((card) => (card.slot === null ? [] : [[card.slug, card.slot]]))
    expect(slots).toEqual([
      ['echo', 1],
      ['sonar', 0],
      ['emp', 2],
    ])
  })

  it.each([
    [0, 'sonar'],
    [1, 'echo'],
    [2, 'emp'],
  ])('a linha %i põe em foco a série dela (%s), e só ela', (row, slug) => {
    const focused = scorestreakCardsOf(CHOICE, row, config.scorestreaks).filter((c) => c.focused)
    expect(focused.map((card) => card.slug)).toEqual([slug])
  })

  it('no VOLTAR, nenhum cartão fica em foco', () => {
    const cards = scorestreakCardsOf(CHOICE, 3, config.scorestreaks)
    expect(cards.some((card) => card.focused)).toBe(false)
  })
})

describe('scorestreakCardStatus', () => {
  it.each([
    [{ live: true, available: true }, ''],
    [{ live: false, available: true }, 'EM BREVE'],
    [{ live: false, available: false }, 'INDISPONÍVEL'],
  ])('%o sai como "%s"', (card, status) => {
    expect(scorestreakCardStatus(card)).toBe(status)
  })
})
