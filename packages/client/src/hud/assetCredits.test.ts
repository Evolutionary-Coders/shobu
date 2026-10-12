import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ASSET_CREDITS,
  ccByLine,
  type GlbAttribution,
  SNIPER_ARMS_ATTRIBUTION,
  SNIPER_ARMS_GLBS,
} from './assetCredits.ts'

const PUBLIC_ASSETS = new URL('../../public/assets/', import.meta.url)
const INDEX_HTML = new URL('../../index.html', import.meta.url)
const LICENSES_DOC = new URL('../../../../docs/asset-licenses.md', import.meta.url)

/** O `asset.extras` de um glb: cabeçalho de 12 bytes, e o primeiro bloco é o json. */
function assetExtrasOf(path: string): unknown {
  const bytes = readFileSync(new URL(path, PUBLIC_ASSETS))
  const length = bytes.readUInt32LE(12)
  const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')) as {
    asset: { extras?: unknown }
  }
  return gltf.asset.extras
}

/** O container da lista de CRÉDITOS, que o `bootOverlay.ts` preenche. */
function creditsContainerInHtml(): boolean {
  const html = readFileSync(INDEX_HTML, 'utf8')
  return /<details id="boot-credits">\s*<summary>CRÉDITOS<\/summary>\s*<ul><\/ul>/.test(html)
}

/** As citações do `asset-licenses.md` (as linhas de crédito), juntadas numa linha. */
function creditQuoteInDoc(): string {
  const doc = readFileSync(LICENSES_DOC, 'utf8')
  return doc
    .split('\n')
    .filter((line) => line.startsWith('> '))
    .map((line) => line.slice(2))
    .join(' ')
}

describe('créditos de asset', () => {
  it('escreve a linha da CC-BY na forma do Sketchfab', () => {
    const attribution: GlbAttribution = {
      title: 't',
      source: 'https://s',
      author: 'a (https://a)',
      license: 'CC-BY-4.0 (https://l)',
    }
    expect(ccByLine(attribution)).toBe(
      'This work is based on "t" (https://s) by a (https://a) licensed under CC-BY-4.0 (https://l)',
    )
  })

  it('põe a atribuição exigida em primeiro, e só ela é exigida', () => {
    expect(ASSET_CREDITS.filter((credit) => credit.required).map((credit) => credit.line)).toEqual([
      ccByLine(SNIPER_ARMS_ATTRIBUTION),
    ])
    expect(ASSET_CREDITS[0]?.required).toBe(true)
  })

  it('a tela de boot tem onde escrever os créditos', () => {
    expect(creditsContainerInHtml()).toBe(true)
  })

  // regressão: a katana e a faca reusam os braços CC-BY da sniper e saíam do
  // blender sem `asset.extras` (revisão de 12/10).
  it.each(SNIPER_ARMS_GLBS)('%s carrega a atribuição CC-BY do braço', (path) => {
    expect(assetExtrasOf(path)).toEqual(SNIPER_ARMS_ATTRIBUTION)
  })

  it('o texto de crédito do asset-licenses.md é a linha da tela', () => {
    expect(creditQuoteInDoc()).toContain(ccByLine(SNIPER_ARMS_ATTRIBUTION))
  })
})
