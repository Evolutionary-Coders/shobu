import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  type GlyphSheet,
  glyphMaskPosition,
  layoutGlyphText,
  parseGlyphSheet,
  runMaskSize,
} from './hudGlyphText.ts'

/** Uma folha pequena, com números redondos para a conta caber de cabeça. */
function tinySheetJson(): Record<string, unknown> {
  return {
    cellHeightPx: 100,
    atlasPx: [400, 200],
    glyphs: {
      ' ': { x: 0, y: 0, width: 20 },
      '0': { x: 100, y: 0, width: 80 },
      A: { x: 200, y: 100, width: 60 },
    },
  }
}

function tinySheet(): GlyphSheet {
  return parseGlyphSheet(tinySheetJson())
}

describe('parseGlyphSheet', () => {
  it('lê a folha que o gerador escreveu de verdade', () => {
    const raw = readFileSync(
      new URL('../../public/assets/fonts/mg-rising-glyphs.json', import.meta.url),
      'utf8',
    )
    const sheet = parseGlyphSheet(JSON.parse(raw))
    // o hud desenha relógio, pontos, munição e as palavras em caixa alta.
    for (const char of '0123456789:,/%[]PTSREINOAGNC') expect(sheet.glyphs.has(char)).toBe(true)
  })

  it('guarda altura de linha e tamanho da folha', () => {
    const sheet = tinySheet()
    expect(sheet.cellHeightPx).toBe(100)
    expect([sheet.atlasWidthPx, sheet.atlasHeightPx]).toEqual([400, 200])
    expect(sheet.blank).toEqual({ x: 0, y: 0, width: 20 })
  })

  it.each([null, 3, [1, 2], 'folha'])('recusa %s como folha, citando o valor', (raw) => {
    expect(() => parseGlyphSheet(raw)).toThrow(/a folha de glifos recebeu .*; esperado objeto/)
  })

  it('recusa folha sem o tamanho em par', () => {
    expect(() => parseGlyphSheet({ ...tinySheetJson(), atlasPx: [400] })).toThrow(
      /atlasPx recebeu \[400\]; esperado \[largura, altura\]/,
    )
  })

  it('recusa altura de linha que não é positiva', () => {
    expect(() => parseGlyphSheet({ ...tinySheetJson(), cellHeightPx: 0 })).toThrow(
      /cellHeightPx recebeu 0; esperado número > 0/,
    )
  })

  it('recusa glifo com posição negativa, dizendo qual', () => {
    const glyphs = { ' ': { x: 0, y: 0, width: 20 }, B: { x: -1, y: 0, width: 5 } }
    expect(() => parseGlyphSheet({ ...tinySheetJson(), glyphs })).toThrow(
      /glyphs\['B'\]\.x recebeu -1; esperado número >= 0/,
    )
  })

  it('recusa glifo sem largura', () => {
    const glyphs = { ' ': { x: 0, y: 0, width: 0 } }
    expect(() => parseGlyphSheet({ ...tinySheetJson(), glyphs })).toThrow(/width recebeu 0/)
  })

  it('recusa folha sem espaço, porque é ele que cobre o que falta', () => {
    const glyphs = { '0': { x: 0, y: 0, width: 10 } }
    expect(() => parseGlyphSheet({ ...tinySheetJson(), glyphs })).toThrow(/glyphs não tem ' '/)
  })
})

describe('layoutGlyphText', () => {
  it('escala largura e posição pela altura pedida', () => {
    const run = layoutGlyphText(tinySheet(), 'A', 50)
    expect(run.glyphs).toEqual([{ char: 'A', widthPx: 30, offsetXPx: 100, offsetYPx: 50 }])
  })

  it('escala a folha inteira, que é o tamanho da máscara', () => {
    const run = layoutGlyphText(tinySheet(), '0', 25)
    expect([run.heightPx, run.atlasWidthPx, run.atlasHeightPx]).toEqual([25, 100, 50])
  })

  it('troca o caractere que a folha não tem por espaço', () => {
    const run = layoutGlyphText(tinySheet(), '0Ç0', 100)
    expect(run.glyphs.map((glyph) => glyph.char)).toEqual(['0', ' ', '0'])
    expect(run.glyphs[1]?.widthPx).toBe(20)
  })

  it('anda por ponto de código, e não por metade de par substituto', () => {
    expect(layoutGlyphText(tinySheet(), '😀', 100).glyphs).toHaveLength(1)
  })

  it('arredonda no centésimo de px', () => {
    expect(layoutGlyphText(tinySheet(), 'A', 33).glyphs[0]?.widthPx).toBe(19.8)
    expect(layoutGlyphText(tinySheet(), '0', 7).glyphs[0]?.widthPx).toBe(5.6)
  })

  it.each([0, -3, Number.NaN])('recusa altura %s', (heightPx) => {
    expect(() => layoutGlyphText(tinySheet(), '0', heightPx)).toThrow(/heightPx recebeu/)
  })
})

describe('as propriedades de máscara', () => {
  it('move a folha para cima e para a esquerda até a célula do glifo', () => {
    const [glyph] = layoutGlyphText(tinySheet(), 'A', 50).glyphs
    expect(glyph && glyphMaskPosition(glyph)).toBe('-100px -50px')
  })

  it('dá a folha escalada como tamanho da máscara', () => {
    expect(runMaskSize(layoutGlyphText(tinySheet(), 'A', 50))).toBe('200px 100px')
  })
})
