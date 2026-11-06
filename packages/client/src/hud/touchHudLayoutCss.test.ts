import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * O hud em volta dos polegares (`touchHudLayout.css`) só pode valer com a
 * camada de toque na tela: uma regra sem o escopo mudaria o hud do desktop
 * calada. O escopo é o atributo que `touchControls.ts` escreve na raiz.
 */
function source(file: string): string {
  return readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
}

const TOUCH_SCOPE = ':root[data-touch-ui="on"]'

/** Os seletores das regras de estilo, sem comentário e sem o `@media` em volta. */
function styleSelectors(css: string): string[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...bare.matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .map(([, selector]) => (selector ?? '').trim())
    .filter((selector) => selector.length > 0)
}

describe('o hud do toque', () => {
  it('toda regra vale só com a camada de toque', () => {
    const selectors = styleSelectors(source('touchHudLayout.css'))
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) expect(selector.startsWith(TOUCH_SCOPE)).toBe(true)
  })

  it('o adapter escreve o atributo do escopo na raiz', () => {
    expect(source('touchControls.ts')).toContain('documentElement.dataset.touchUi')
  })

  it('a camada de toque traz o arquivo junto', () => {
    expect(source('touchControls.css')).toContain('@import url("./touchHudLayout.css");')
  })

  it('o registro de combate e a lista das séries saem do toque', () => {
    const css = source('touchHudLayout.css')
    const hidden = styleSelectors(css).find((selector) => selector.includes('#hud-combat-log'))
    expect(hidden).toContain('#hud-scorestreaks')
  })

  it('o canto do minimapa fica reservado: nenhum painel começa nele', () => {
    const css = source('touchHudLayout.css')
    expect(css).toMatch(/--touch-minimap-size:/)
    // o fps e o killfeed, os dois da coluna da esquerda, descem do quadrado.
    expect(css.match(/var\(--touch-minimap-size\)/g)?.length).toBe(2)
  })
})
