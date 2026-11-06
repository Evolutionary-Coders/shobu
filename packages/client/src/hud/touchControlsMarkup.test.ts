import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Os botões de toque falam só português (3/11): o kanji em cima de cada
 * rótulo era um desenho a decorar no polegar, e quem jogava no celular pediu
 * para tirar. O resto do hud continua com o kanji da identidade — a tranca é
 * só na camada de toque e no rosto da lâmina que `touchControls.ts` escreve.
 */
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/u

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

/** O `<section id="touch-controls">` inteiro do index.html. */
function touchSection(): string {
  const html = source('../../index.html')
  const start = html.indexOf('<section id="touch-controls"')
  const end = html.indexOf('</section>', start)
  if (start < 0 || end < 0) {
    throw new Error(
      `index.html sem #touch-controls (início ${start}, fim ${end}); esperado um <section>`,
    )
  }
  return html.slice(start, end)
}

describe('os controles de toque sem kanji', () => {
  it('nenhum rótulo da camada de toque tem kanji ou kana', () => {
    expect(touchSection().match(CJK)).toBeNull()
  })

  it('o rosto da lâmina, que o adapter troca, também não', () => {
    expect(source('./touchControls.ts').match(CJK)).toBeNull()
  })

  it('todo botão de toque tem um rótulo escrito', () => {
    const buttons = [...touchSection().matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)]
    expect(buttons.length).toBeGreaterThan(0)
    for (const [, inner] of buttons) expect(inner).toMatch(/class="touch-label">[^<]+</)
  })
})
