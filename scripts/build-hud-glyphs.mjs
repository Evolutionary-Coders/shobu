#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Rasteriza a fonte MG Rising numa folha de glifos para os números do HUD:
 *
 *   npm run build:hud-glyphs
 *
 * **Por que imagem e não `@font-face`.** A MG Rising é uma fonte do FontStruct
 * sob licença não comercial que proíbe, com todas as letras, o uso como
 * webfont (§2.6), a redistribuição do arquivo (§2.3) e a modificação (§2.4).
 * O que a licença permite é embutir a fonte **rasterizada** (§2.5). Então o
 * arquivo `.otf` fica em `assets/`, fora do git e fora do servidor, e o que o
 * jogo recebe é uma folha PNG de glifos brancos com as medidas ao lado — o
 * HUD pinta a cor por máscara (`hudGlyphText.ts`).
 *
 * Procedência e licença em `docs/asset-licenses.md`, seção de fonte.
 */

const ROOT = new URL('../', import.meta.url)
const FONT = new URL('assets/mg-rising.otf/mg-rising.otf', ROOT)
const TARGET_PNG = new URL('packages/client/public/assets/fonts/mg-rising-glyphs.png', ROOT)
const TARGET_JSON = new URL('packages/client/public/assets/fonts/mg-rising-glyphs.json', ROOT)

/** Altura de cada linha do atlas, em px. O HUD escala para baixo, nunca para cima. */
const CELL_HEIGHT_PX = 96
const POINT_SIZE = 88
const PADDING_PX = 4
const ROW_WIDTH_PX = 1024

/** Os caracteres que a fonte tem (`fc-scan`) e que o HUD usa. */
const CHARSET = ' !"%\',./0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_abcdefghijklmnopqrstuvwxyz'

if (!existsSync(FONT)) {
  throw new Error(
    `${FONT.pathname} não existe; esperado o .otf da MG Rising em assets/ (fora do git)`,
  )
}

const scratch = mkdtempSync(join(tmpdir(), 'shobu-glyphs-'))
try {
  const glyphs = renderGlyphs(scratch)
  const layout = packRows(glyphs)
  compose(layout, scratch)
  const metrics = {
    $comment: 'gerado por scripts/build-hud-glyphs.mjs; não editar',
    cellHeightPx: CELL_HEIGHT_PX,
    glyphs: Object.fromEntries(
      layout.placed.map(({ char, x, y, width }) => [char, { x, y, width }]),
    ),
    atlasPx: [ROW_WIDTH_PX, layout.heightPx],
  }
  writeFileSync(TARGET_JSON, `${JSON.stringify(metrics, null, 2)}\n`)
  console.log(`${layout.placed.length} glifos → ${TARGET_PNG.pathname}`)
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

function renderGlyphs(dir) {
  return [...CHARSET].map((char, index) => {
    const file = join(dir, `g${index}.png`)
    execFileSync('magick', glyphArguments(char, file))
    const width = Number(
      execFileSync('magick', ['identify', '-format', '%w', file], { encoding: 'utf8' }),
    )
    return { char, file, width }
  })
}

function glyphArguments(char, file) {
  return [
    ...['-background', 'none', '-fill', 'white', '-font', FONT.pathname],
    ...['-pointsize', `${POINT_SIZE}`, '-gravity', 'center', `label:${magickLabel(char)}`],
    ...['-resize', `x${CELL_HEIGHT_PX}!`, file],
  ]
}

/**
 * O `label:` do magick lê `%` como formato de propriedade, e ele precisa
 * dobrar para sair literal. A barra invertida, que o magick lê como escape,
 * nem entra no conjunto: o HUD não a usa. Espaço vira espaço duro, senão o
 * label sai com largura zero.
 */
function magickLabel(char) {
  if (char === ' ') return '\u00a0'
  if (char === '%') return '%%'
  return char
}

function packRows(glyphs) {
  const placed = []
  let x = 0
  let y = 0
  for (const glyph of glyphs) {
    if (x + glyph.width > ROW_WIDTH_PX) {
      x = 0
      y += CELL_HEIGHT_PX + PADDING_PX
    }
    placed.push({ ...glyph, x, y })
    x += glyph.width + PADDING_PX
  }
  return { placed, heightPx: y + CELL_HEIGHT_PX }
}

function compose(layout, dir) {
  const args = ['-size', `${ROW_WIDTH_PX}x${layout.heightPx}`, 'xc:none']
  for (const { file, x, y } of layout.placed) {
    args.push(file, '-geometry', `+${x}+${y}`, '-composite')
  }
  args.push('-strip', join(dir, 'atlas.png'))
  execFileSync('magick', args)
  execFileSync('magick', [
    join(dir, 'atlas.png'),
    '-define',
    'png:compression-level=9',
    TARGET_PNG.pathname,
  ])
}
