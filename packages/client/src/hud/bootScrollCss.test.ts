import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * A tela de boot nunca rola (12/10): descer pelo menu até uma linha abaixo do
 * meio da tela rolava o `#boot-overlay` para cima, e o jogo aparecia por baixo
 * dele. O `scrollIntoView` da seleção rolava todo ancestral rolável, e um
 * `overflow: hidden` é rolável por script. Quem rola agora é só o painel da
 * sub-tela (`panelReveal.ts`).
 */
function source(file: string): string {
  return readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
}

/** O corpo da primeira regra cujo seletor é exatamente `selector`. */
function ruleBody(css: string, selector: string): string {
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
    ([, head]) => (head ?? '').replace(/\/\*[\s\S]*?\*\//g, '').trim() === selector,
  )
  if (!rule) throw new Error(`nenhuma regra "${selector}"; esperado um bloco com esse seletor`)
  return rule[2] ?? ''
}

describe('a tela de boot nunca rola', () => {
  it('o #boot-overlay corta com clip, que nenhum script consegue rolar', () => {
    const body = ruleBody(source('hud.css'), '#boot-overlay')
    expect(body).toMatch(/overflow:\s*clip;/)
    expect(body).not.toMatch(/overflow:\s*hidden;/)
  })

  it('o painel da sub-tela é quem rola, por dentro', () => {
    expect(ruleBody(source('bootMenu.css'), '.menu-panel')).toMatch(/overflow-y:\s*auto;/)
  })

  it('o menu não chama scrollIntoView, e o foco do nome não rola nada', () => {
    const menu = source('bootMenu.ts')
    expect(menu).not.toMatch(/\.scrollIntoView\(/)
    for (const call of menu.matchAll(/\.focus\(([^)]*)\)/g)) {
      expect(call[1]).toContain('preventScroll: true')
    }
  })
})
