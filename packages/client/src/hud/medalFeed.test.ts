import { readFileSync } from 'node:fs'
import { MEDAL_CATALOG, type MedalAward } from '@shobu/core'
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

/**
 * A força da entrada é a escada de raridade desenhada em css, e css não entra
 * na conta de cobertura. Estas asserções são a tranca do que quebraria em
 * silêncio: raridade nova cairia na animação da comum sem ninguém ver, e um
 * `0%` visível faria as três medalhas de uma kill aparecerem empilhadas em vez
 * de em fila.
 */
describe('a animação de cada raridade', () => {
  const css = readFileSync(new URL('./arenaMedals.css', import.meta.url), 'utf8')
  const rarities = [...new Set(MEDAL_CATALOG.map((medal) => medal.rarity))]

  it('o catálogo tem as quatro raridades, senão o teste abaixo passaria de menos', () => {
    expect(rarities).toHaveLength(4)
  })

  it.each(rarities)('%s tem regra própria de animação', (rarity) => {
    expect(css).toContain(`.medal-toast[data-rarity="${rarity}"]`)
    expect(css).toContain(`animation-name: medal-${rarity}`)
  })

  it.each(rarities)('%s tem os próprios quadros-chave', (rarity) => {
    expect(css).toContain(`@keyframes medal-${rarity}`)
  })

  /**
   * O bloco de um `@keyframes` só, e não o resto do arquivo a partir dele:
   * recortar até o próximo `6%` pegava os quadros da regra seguinte, e o teste
   * passava por causa deles mesmo com esta raridade quebrada.
   */
  function keyframesOf(rarity: string): string {
    const start = css.indexOf(`@keyframes medal-${rarity} {`)
    const next = css.indexOf('@keyframes', start + 1)
    return css.slice(start, next < 0 ? undefined : next)
  }

  /**
   * Sem isto, a fila de `toastDelayMs` mostraria tudo de uma vez.
   *
   * O `\n` na expressão não é enfeite: sem ele o `0%` casa com o fim de
   * `100%`, e o quadro final — que também é `opacity: 0` — fazia o teste
   * passar mesmo com o quadro inicial visível.
   */
  it.each(rarities)('%s começa invisível, que é onde ela espera a vez na fila', (rarity) => {
    expect(keyframesOf(rarity)).toMatch(/\n\s*0%\s*\{\s*opacity:\s*0;/)
  })

  it.each(rarities)('%s termina invisível, senão o toast nunca sairia da tela', (rarity) => {
    expect(keyframesOf(rarity)).toMatch(/100%\s*\{\s*opacity:\s*0;/)
  })

  /**
   * O bloco de movimento reduzido tem que casar a especificidade do seletor de
   * raridade, senão perde para ele e a lendária continua tremendo — já houve
   * um defeito exatamente assim neste hud (555df2a).
   */
  it.each(rarities)('%s é desligada no movimento reduzido', (rarity) => {
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'))
    expect(reduced).toContain(`.medal-toast[data-rarity="${rarity}"]`)
  })

  /**
   * O toast e as camadas de luz são animações separadas sobre o mesmo evento.
   * Uma delas com duração diferente descasa a fila de `toastDelayMs` e faz o
   * brilho de uma medalha correr sobre a arte da seguinte.
   */
  it('toda animação do feed dura o que a fila supõe', () => {
    const durations = [...css.matchAll(/animation:\s*[\w-]+\s+(\d+)ms/g)].map((m) => Number(m[1]))
    expect(durations.length).toBeGreaterThanOrEqual(4)
    expect([...new Set(durations)]).toEqual([MEDAL_LIFETIME_MS])
  })

  /**
   * O adapter escreve o atraso da fila só no `.medal-toast`. As camadas herdam
   * esse atraso — sem `inherit`, o brilho e o clarão de todas as medalhas da
   * kill disparariam no primeiro quadro, enquanto a arte ainda esperava a vez.
   */
  it('as camadas herdam o atraso da fila em vez de começar na hora', () => {
    const shorthands = [...css.matchAll(/animation:\s*[\w-]+\s+\d+ms/g)].length
    const inherited = [...css.matchAll(/animation-delay:\s*inherit;/g)].length
    // todas menos a do próprio toast, que é quem recebe o atraso do adapter.
    expect(inherited).toBe(shorthands - 1)
  })

  /**
   * Um `radial-gradient` que termina em cor fica naquela cor até a borda da
   * caixa — e a caixa é quadrada. Foi assim que a vinheta da lendária virou um
   * quadrado preto voando atrás da medalha.
   */
  it('nenhum gradiente redondo termina em cor, senão vira quadrado', () => {
    const gradients = [...css.matchAll(/radial-gradient\(([^;]*?)\)[,;]/g)].map((m) => m[1] ?? '')
    expect(gradients.length).toBeGreaterThan(0)
    for (const gradient of gradients) {
      expect(gradient.trimEnd(), gradient).toMatch(/transparent(\s+\d+%)?$/)
    }
  })

  /**
   * As camadas de luz se recortam na silhueta do escudo. Sem a máscara elas
   * cruzam a transparência em volta da arte — que é metade da caixa — e o
   * efeito vira facho de lanterna sobre a arena, que foi como a primeira
   * versão deste feed foi reprovada.
   */
  it('as camadas de luz se recortam na arte, e não na caixa', () => {
    expect(css).toContain('mask-image: var(--medal-src)')
    expect(css).toContain('mix-blend-mode: plus-lighter')
  })
})
