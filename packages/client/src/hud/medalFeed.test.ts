import type { MedalAward } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { MEDAL_FEED_CAPACITY, MEDAL_LIFETIME_MS, medalIconUrl, medalToasts } from './medalFeed.ts'

const KILL_POINTS = 100

function awardOf(slug: string, label: string, points: number): MedalAward {
  return { medal: { slug, label, rarity: 'incomum' }, points } as MedalAward
}

const DOUBLE_KILL = awardOf('double-kill', 'DOUBLE KILL', 50)
const HEADSHOT = awardOf('headshot', 'HEADSHOT', 50)

describe('medalToasts', () => {
  it('a medalha sozinha lê o total da jogada', () => {
    expect(medalToasts([DOUBLE_KILL], KILL_POINTS)[0]?.points).toBe('+150')
  })

  it('escreve o nome da medalha, que o ícone não entrega a 56 px', () => {
    expect(medalToasts([DOUBLE_KILL], KILL_POINTS)[0]?.label).toBe('DOUBLE KILL')
  })

  it('a segunda medalha da mesma kill mostra só o próprio bônus', () => {
    expect(medalToasts([DOUBLE_KILL, HEADSHOT], KILL_POINTS).map((t) => t.points)).toEqual([
      '+150',
      '+50',
    ])
  })

  it('a soma dos toasts bate com a soma do placar', () => {
    const awards = [DOUBLE_KILL, HEADSHOT]
    const naTela = medalToasts(awards, KILL_POINTS).reduce(
      (sum, toast) => sum + Number(toast.points),
      0,
    )
    const noPlacar = KILL_POINTS + awards.reduce((sum, award) => sum + award.points, 0)
    expect(naTela).toBe(noPlacar)
  })

  it('kill sem medalha não gera toast nenhum', () => {
    expect(medalToasts([], KILL_POINTS)).toEqual([])
  })

  it('leva a raridade, que é quem manda na cor', () => {
    expect(medalToasts([DOUBLE_KILL], KILL_POINTS)[0]?.rarity).toBe('incomum')
  })
})

describe('medalIconUrl', () => {
  it('aponta para o convertido em public/, pelo slug', () => {
    expect(medalIconUrl('360-no-scope')).toBe('/assets/images/medals/360-no-scope.webp')
  })
})

describe('a pilha do feed', () => {
  it('cabe uma kill de três medalhas sem empurrar nenhuma para fora', () => {
    expect(MEDAL_FEED_CAPACITY).toBeGreaterThanOrEqual(3)
  })

  /** O css é quem faz o toast sumir; a constante é o contrato entre os dois. */
  it('a vida do toast é curta o bastante para a pilha girar', () => {
    expect(MEDAL_LIFETIME_MS).toBeGreaterThan(0)
    expect(MEDAL_LIFETIME_MS).toBeLessThan(10_000)
  })

  it('a ordem dos toasts é a das medalhas concedidas', () => {
    const toasts = medalToasts([DOUBLE_KILL, HEADSHOT], KILL_POINTS)
    expect(toasts.map((toast) => toast.label)).toEqual(['DOUBLE KILL', 'HEADSHOT'])
  })
})
