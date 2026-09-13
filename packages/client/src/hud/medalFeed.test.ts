import type { MedalAward } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  MEDAL_LIFETIME_MS,
  medalIconUrl,
  medalLabels,
  medalToasts,
  toastDelayMs,
} from './medalFeed.ts'

function awardOf(slug: string, label: string, rarity = 'incomum'): MedalAward {
  return { medal: { slug, label, rarity }, points: 50 } as MedalAward
}

const DOUBLE_KILL = awardOf('double-kill', 'DOUBLE KILL')
const NO_SCOPE = awardOf('no-scope', 'NO SCOPE', 'comum')

describe('medalToasts', () => {
  it('leva o nome da medalha, que o ícone não entrega no tamanho do toast', () => {
    expect(medalToasts([DOUBLE_KILL])[0]?.label).toBe('DOUBLE KILL')
  })

  it('o nome já vem em caixa alta do catálogo, sem o css transformar', () => {
    expect(medalToasts([DOUBLE_KILL])[0]?.label).toBe('DOUBLE KILL'.toUpperCase())
  })

  /** O número vive na retícula; repeti-lo aqui faria a medalha virar placar. */
  it('não carrega pontuação nenhuma', () => {
    expect(Object.keys(medalToasts([DOUBLE_KILL])[0] ?? {}).sort()).toEqual([
      'iconUrl',
      'label',
      'rarity',
    ])
  })

  it('leva a raridade, que é quem manda na cor', () => {
    expect(medalToasts([NO_SCOPE])[0]?.rarity).toBe('comum')
  })

  it('aponta o ícone convertido em public/, pelo slug', () => {
    expect(medalToasts([DOUBLE_KILL])[0]?.iconUrl).toBe('/assets/images/medals/double-kill.webp')
  })

  it('kill sem medalha não gera toast nenhum', () => {
    expect(medalToasts([])).toEqual([])
  })

  it('uma entrada por medalha, na ordem em que foram ganhas', () => {
    expect(medalToasts([NO_SCOPE, DOUBLE_KILL]).map((t) => t.label)).toEqual([
      'NO SCOPE',
      'DOUBLE KILL',
    ])
  })
})

describe('medalIconUrl', () => {
  it('monta o caminho pelo slug', () => {
    expect(medalIconUrl('360-no-scope')).toBe('/assets/images/medals/360-no-scope.webp')
  })
})

describe('toastDelayMs', () => {
  it('a primeira medalha entra na hora', () => {
    expect(toastDelayMs(0)).toBe(0)
  })

  it('a segunda espera a primeira terminar, e não se sobrepõe a ela', () => {
    expect(toastDelayMs(1)).toBe(MEDAL_LIFETIME_MS)
  })

  it('a fila é regular: cada medalha custa uma vida de toast', () => {
    expect(toastDelayMs(3) - toastDelayMs(2)).toBe(MEDAL_LIFETIME_MS)
  })

  /** Quatro medalhas numa kill é o teto real; a fila não pode passar disso. */
  it('a fila de uma kill inteira cabe em poucos segundos', () => {
    expect(toastDelayMs(3) + MEDAL_LIFETIME_MS).toBeLessThan(12_000)
  })

  it.each([-1, 1.5, Number.NaN])('recusa índice %s, dizendo o valor recebido', (index) => {
    expect(() => toastDelayMs(index)).toThrow(`toastDelayMs recebeu ${index}`)
  })
})

describe('medalLabels', () => {
  it('são os nomes que acompanham o +xxx na retícula', () => {
    expect(medalLabels([NO_SCOPE, DOUBLE_KILL])).toEqual(['NO SCOPE', 'DOUBLE KILL'])
  })

  it('kill sem medalha não escreve nome nenhum sob o número', () => {
    expect(medalLabels([])).toEqual([])
  })
})
