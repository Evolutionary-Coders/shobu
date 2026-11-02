import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const INDEX_HTML = new URL('../../index.html', import.meta.url)
const PUBLIC_DIR = new URL('../../public/', import.meta.url)

/** O `href` do `<link rel="icon">` do index.html, ou `undefined` sem ele. */
function iconHrefInHtml(): string | undefined {
  const html = readFileSync(INDEX_HTML, 'utf8')
  return /<link rel="icon"[^>]*href="\/([^"]+)"/.exec(html)?.[1]
}

describe('o ícone da página', () => {
  /** Regressão: sem ícone declarado, cada carga pedia /favicon.ico e dava 404 no console. */
  it('o index.html declara um ícone que existe em public/', () => {
    const href = iconHrefInHtml()
    expect(href).toBeDefined()
    expect(existsSync(new URL(href as string, PUBLIC_DIR))).toBe(true)
  })
})
