import { type GlyphSheet, parseGlyphSheet } from './hudGlyphText.ts'

/**
 * As medidas da folha de glifos da MG Rising, geradas por
 * `scripts/build-hud-glyphs.mjs` ao lado do PNG. A imagem em si o css busca
 * pela máscara; o javascript só precisa saber onde cada glifo está nela.
 */
export const GLYPH_SHEET_URL = '/assets/fonts/mg-rising-glyphs.json'

/**
 * Falha ruidosamente, como o `fetchGameplayConfig`: um hud sem as medidas não
 * teria número nenhum, e isso é pior que o jogo não abrir.
 *
 * ```ts
 * const glyphs = await fetchGlyphSheet(GLYPH_SHEET_URL)
 * ```
 */
export async function fetchGlyphSheet(url: string): Promise<GlyphSheet> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`GET ${url} respondeu ${response.status}; esperado 200 com a folha de glifos`)
  }
  return parseGlyphSheet(await response.json())
}
