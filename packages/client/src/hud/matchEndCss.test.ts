import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * A tela do fim de partida esconde o resto do hud por uma regra só
 * (`arenaMatchEnd.css`), e ela tem especificidade (2,1,0). Quem se mostra por
 * atributo próprio tem mais, e venceria: a tela de morte, o cartão de abate e
 * o placar do TAB apareciam por cima do cartão do MVP. Cada regra que os
 * mostra precisa repetir que a partida está correndo.
 */
const SHOWN_BY_OWN_ATTRIBUTE: ReadonlyArray<readonly [string, string]> = [
  ['arenaScoreboard.css', '#hud-death'],
  ['arenaScoreboard.css', '#hud-scoreboard'],
  ['arenaKillBanner.css', '#hud-killbanner'],
]

/** Os seletores das regras do arquivo que tornam `target` visível. */
function showingSelectors(file: string, target: string): string[] {
  const css = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  return rules
    .filter(
      ([, selector, body]) => selector?.includes(target) && body?.includes('visibility: visible'),
    )
    .map(([, selector]) => (selector ?? '').replace(/\/\*[\s\S]*?\*\//g, '').trim())
}

describe('o fim de partida vence o resto do hud', () => {
  it.each(SHOWN_BY_OWN_ATTRIBUTE)('%s: %s só aparece com a partida correndo', (file, target) => {
    const selectors = showingSelectors(file, target)
    expect(selectors.length, `nenhuma regra mostra ${target} em ${file}`).toBeGreaterThan(0)
    for (const selector of selectors) expect(selector).toContain('[data-match-end="off"]')
  })
})
