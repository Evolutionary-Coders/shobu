#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'

/**
 * Converte os ícones de medalha (`assets/images/medals/<raridade>/<slug>.png`,
 * produção própria) para o que a `docs/medals.md` especifica em `public/`:
 * webp de 128 × 128 com fundo transparente. A origem não entra no git — são
 * 35 MB de png a ~1250 px —, e este script é o que permite refazer o
 * convertido a partir dela.
 *
 *   node scripts/convert-medals.mjs
 *
 * O que ele faz, e por quê:
 * - **`-trim`**: as artes vêm com margem transparente desigual, e sem aparar
 *   cada ícone ocuparia uma fração diferente do seu quadrado no toast.
 * - **`-extent` quadrado depois do `-resize`**: as artes são ~1218 × 1292, e
 *   não quadradas. Redimensionar para 128 × 128 direto as achataria.
 * - **`magick` e não uma biblioteca de node**: é a mesma ferramenta que gerou
 *   o `logo.webp` e o primeiro `headshot.webp` (`docs/asset-licenses.md`), e o
 *   `convert-viewmodel.mjs` já registra por que o sharp não entra aqui.
 */
const SOURCE_DIR = new URL('../assets/images/medals/', import.meta.url)
const TARGET_DIR = new URL('../packages/client/public/assets/images/medals/', import.meta.url)

/** Tamanho real no toast do hud é 56 px; 128 cobre tela de alta densidade. */
const ICON_SIZE_PX = 128

/**
 * Slug por raridade — a mesma tabela de `docs/medals.md`, que é também a
 * pasta de origem. `medalCatalog.test.ts` é quem tranca as duas contra o
 * catálogo do jogo; aqui ela existe só para achar o arquivo.
 *
 * O `airbone.png` da origem está com o nome trocado: o slug é `airborne`, e é
 * ele que a `docs/medals.md`, o manifesto do narrador e o catálogo usam.
 */
const MEDALS = {
  comum: { 'no-scope': 'no-scope', knife: 'knife', payback: 'payback' },
  incomum: {
    headshot: 'headshot',
    'double-kill': 'double-kill',
    'first-blood': 'first-blood',
    airborne: 'airbone',
    backstab: 'backstab',
    skeet: 'skeet',
  },
  rara: {
    'triple-kill': 'triple-kill',
    'longshot-no-scope': 'longshot-no-scope',
    'on-the-rope': 'on-the-rope',
    buzzkill: 'buzzkill',
  },
  lendaria: {
    '360-no-scope': '360-no-scope',
    overkill: 'overkill',
    'kill-chain': 'kill-chain',
    collateral: 'collateral',
  },
}

mkdirSync(TARGET_DIR.pathname, { recursive: true })
const converted = Object.entries(MEDALS).flatMap(([rarity, slugs]) =>
  Object.entries(slugs).map(([slug, file]) => convert(rarity, slug, file)),
)
report(converted)

function convert(rarity, slug, file) {
  const source = new URL(`${rarity}/${file}.png`, SOURCE_DIR)
  const target = new URL(`${slug}.webp`, TARGET_DIR)
  execFileSync('magick', squareIconArgs(source.pathname, target.pathname))
  return { slug, rarity, bytes: statSync(target.pathname).size }
}

/** Apara, cabe em 128, e só então vira quadrado: a ordem é o que evita achatar. */
function squareIconArgs(source, target) {
  const size = `${ICON_SIZE_PX}x${ICON_SIZE_PX}`
  return [
    source,
    '-trim',
    '+repage',
    '-resize',
    size,
    '-background',
    'none',
    '-gravity',
    'center',
    '-extent',
    size,
    '-strip',
    '-quality',
    '92',
    '-define',
    'webp:alpha-quality=100',
    target,
  ]
}

function report(icons) {
  console.log(
    JSON.stringify({
      target: TARGET_DIR.pathname,
      icons: icons.length,
      totalBytes: icons.reduce((sum, icon) => sum + icon.bytes, 0),
      largest: icons.reduce((worst, icon) => (icon.bytes > worst.bytes ? icon : worst)),
    }),
  )
}
