/**
 * Texto desenhado a partir da folha de glifos da MG Rising.
 *
 * **Não é fonte, é imagem.** A licença da MG Rising proíbe servi-la como
 * webfont (`docs/asset-licenses.md`), e o que o jogo recebe é uma folha PNG de
 * glifos brancos com as medidas ao lado, gerada por
 * `scripts/build-hud-glyphs.mjs`. Cada caractere vira um `span` que usa a folha
 * como `mask-image` e pinta `currentColor` por baixo dela: é o que deixa o
 * mesmo número sair vermelho, branco ou amarelo sem uma folha por cor.
 *
 * Este módulo é a conta; quem cria o `span` é o `hudGlyphDom.ts`.
 */

/** Onde um glifo está na folha, em px da folha. */
export interface GlyphCell {
  readonly x: number
  readonly y: number
  readonly width: number
}

export interface GlyphSheet {
  /** Altura de toda linha da folha. É a altura de todo glifo. */
  readonly cellHeightPx: number
  readonly atlasWidthPx: number
  readonly atlasHeightPx: number
  readonly glyphs: ReadonlyMap<string, GlyphCell>
  /** O espaço, que é o que se desenha no lugar do que a folha não tem. */
  readonly blank: GlyphCell
}

/** Um glifo já escalado para a altura pedida, em px de tela. */
export interface PlacedGlyph {
  /** O caractere que a folha desenha: o pedido, ou espaço se ela não o tem. */
  readonly char: string
  readonly widthPx: number
  readonly offsetXPx: number
  readonly offsetYPx: number
}

export interface GlyphRun {
  readonly heightPx: number
  /** A folha inteira na escala da linha: é o `mask-size` de cada glifo. */
  readonly atlasWidthPx: number
  readonly atlasHeightPx: number
  readonly glyphs: readonly PlacedGlyph[]
}

/** O caractere que substitui qualquer um que a folha não tem. */
const MISSING_GLYPH = ' '

/**
 * Lê o `mg-rising-glyphs.json` como ele chega da rede, recusando o que não
 * tiver a forma que o gerador escreve.
 *
 * ```ts
 * const sheet = parseGlyphSheet(await response.json())
 * ```
 *
 * @throws TypeError json fora da forma `{ cellHeightPx, atlasPx, glyphs }`
 */
export function parseGlyphSheet(raw: unknown): GlyphSheet {
  const root = requireRecord(raw, 'a folha de glifos')
  const [atlasWidthPx, atlasHeightPx] = requireAtlas(root.atlasPx)
  const glyphs = new Map(
    Object.entries(requireRecord(root.glyphs, 'glyphs')).map(([char, cell]) => [
      char,
      requireCell(char, cell),
    ]),
  )
  const blank = glyphs.get(MISSING_GLYPH)
  if (!blank) {
    throw new TypeError(`glyphs não tem ' '; esperado o espaço, que substitui o que falta`)
  }
  return {
    cellHeightPx: requirePositive(root.cellHeightPx, 'cellHeightPx'),
    atlasWidthPx,
    atlasHeightPx,
    glyphs,
    blank,
  }
}

/**
 * Dispõe `text` na folha com `heightPx` de altura. Caractere que a folha não
 * tem vira espaço, e não erro: um apelido com `Ç` perde a letra, não a tela.
 *
 * ```ts
 * layoutGlyphText(sheet, '05', 32).glyphs.length // 2
 * ```
 *
 * @throws RangeError altura que não é número positivo
 */
export function layoutGlyphText(sheet: GlyphSheet, text: string, heightPx: number): GlyphRun {
  const scale = requirePositive(heightPx, 'heightPx') / sheet.cellHeightPx
  return {
    heightPx,
    atlasWidthPx: roundPx(sheet.atlasWidthPx * scale),
    atlasHeightPx: roundPx(sheet.atlasHeightPx * scale),
    glyphs: [...text].map((char) => placeGlyph(sheet, char, scale)),
  }
}

/**
 * O `mask-position` de um glifo: a folha anda para a esquerda e para cima até
 * a célula dele cair na caixa do `span`.
 *
 * ```ts
 * glyphMaskPosition({ char: '0', widthPx: 10, offsetXPx: 20, offsetYPx: 0 }) // '-20px -0px'
 * ```
 */
export function glyphMaskPosition(glyph: PlacedGlyph): string {
  return `-${glyph.offsetXPx}px -${glyph.offsetYPx}px`
}

/**
 * O `mask-size` de todo glifo da linha.
 *
 * ```ts
 * runMaskSize(layoutGlyphText(sheet, '5', 48)) // '512px 348px'
 * ```
 */
export function runMaskSize(run: GlyphRun): string {
  return `${run.atlasWidthPx}px ${run.atlasHeightPx}px`
}

function placeGlyph(sheet: GlyphSheet, wanted: string, scale: number): PlacedGlyph {
  const known = sheet.glyphs.get(wanted)
  const char = known ? wanted : MISSING_GLYPH
  const cell = known ?? sheet.blank
  return {
    char,
    widthPx: roundPx(cell.width * scale),
    offsetXPx: roundPx(cell.x * scale),
    offsetYPx: roundPx(cell.y * scale),
  }
}

/** Centésimo de px: o bastante para a máscara, e curto no atributo `style`. */
function roundPx(value: number): number {
  return Math.round(value * 100) / 100
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw new TypeError(`${name} recebeu ${JSON.stringify(value)}; esperado objeto`)
}

function requireAtlas(value: unknown): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TypeError(`atlasPx recebeu ${JSON.stringify(value)}; esperado [largura, altura]`)
  }
  return [requirePositive(value[0], 'atlasPx[0]'), requirePositive(value[1], 'atlasPx[1]')]
}

function requireCell(char: string, value: unknown): GlyphCell {
  const cell = requireRecord(value, `glyphs['${char}']`)
  return {
    x: requireNonNegative(cell.x, `glyphs['${char}'].x`),
    y: requireNonNegative(cell.y, `glyphs['${char}'].y`),
    width: requirePositive(cell.width, `glyphs['${char}'].width`),
  }
}

function requirePositive(value: unknown, name: string): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  throw new RangeError(`${name} recebeu ${String(value)}; esperado número > 0`)
}

function requireNonNegative(value: unknown, name: string): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  throw new RangeError(`${name} recebeu ${String(value)}; esperado número >= 0`)
}
