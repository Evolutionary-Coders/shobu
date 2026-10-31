#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import {
  SCORESTREAK_CATALOG,
  SCORESTREAK_TIER_ACCENT,
} from '../packages/core/src/streaks/scorestreakCatalog.ts'
import { CARD_COLOR, PICTOGRAMS } from './scorestreak-icons/pictograms.mjs'

/**
 * Desenha as miniaturas das doze séries de pontuação (ADR 0029), produção
 * própria, em `public/assets/images/scorestreaks/<slug>.svg`:
 *
 *   npm run build:scorestreak-icons
 *
 * A referência é o ícone de scorestreak do Black Ops 2: um pictograma chapado,
 * de uma cor só, centrado num cartão escuro, que se lê de relance. Aqui é
 * off-white sobre grafite, e a cor do peso (ciano, magenta, vermelho neon) fica
 * só na borda e no entalhe do canto — o pictograma não muda de cor com o peso,
 * para o conjunto ter o mesmo traço.
 *
 * **Por que svg e não webp como as medalhas.** As medalhas têm filigrana
 * pintada, e só um raster carrega isso. Aqui é cor chapada em polígono, que é
 * exatamente o que svg descreve: o mesmo arquivo fica nítido a 48 px no hud e
 * a 128 px no menu, pesa ~1 kB, e o script não precisa de `magick` nem de
 * dependência nativa — roda em qualquer máquina que tenha o node.
 *
 * O peso de cada série sai do próprio catálogo, então mudar uma série de peso
 * lá e rodar o script de novo é o que basta para a borda acompanhar.
 */
const TARGET_DIR = new URL('../packages/client/public/assets/images/scorestreaks/', import.meta.url)

mkdirSync(TARGET_DIR.pathname, { recursive: true })
const written = SCORESTREAK_CATALOG.map(writeIcon)
console.log(JSON.stringify({ target: TARGET_DIR.pathname, icons: written }))

function writeIcon({ slug, tier, label }) {
  const pictogram = PICTOGRAMS[slug]
  if (!pictogram) {
    throw new Error(`a série ${slug} não tem pictograma; esperado uma chave em PICTOGRAMS`)
  }
  const svg = iconSvg(label, cardSvg(SCORESTREAK_TIER_ACCENT[tier]), pictogram())
  writeFileSync(new URL(`${slug}.svg`, TARGET_DIR), svg)
  return { slug, tier, bytes: Buffer.byteLength(svg) }
}

/** O `<title>` com o rótulo do catálogo é o texto alternativo de quem lê o svg sozinho. */
function iconSvg(label, card, pictogram) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"',
    ' shape-rendering="geometricPrecision">',
    `<title>${label}</title>`,
    '<!-- gerado por scripts/build-scorestreak-icons.mjs; não editar -->',
    `${card}${pictogram}</svg>\n`,
  ].join('')
}

/**
 * Cartão com o canto superior direito chanfrado e um entalhe cheio no inferior
 * esquerdo, os dois na cor do peso. A borda tem 4 unidades porque a 48 px ela
 * vira 1,5 px — menos que isso some no hud.
 */
function cardSvg(accent) {
  const outline = '3,3 105,3 125,23 125,125 3,125'
  return [
    `<polygon points="${outline}" fill="${CARD_COLOR}" stroke="${accent}" stroke-width="4"/>`,
    `<polygon points="3,103 3,125 25,125" fill="${accent}"/>`,
  ].join('')
}
