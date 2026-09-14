#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'

/**
 * Converte quatro texturas do pacote `cyberpunk-building` para as superfícies
 * do greybox, em `assets/source/scene/cyberpunk-building/textures/`:
 *
 *   node scripts/convert-arena-textures.mjs
 *
 * **Por que deste pacote e não dos cenários.** Os `.glb` de cenário trazem
 * textura de 2048 a 8192 px com `metallicRoughness` e `normal` — tudo que a
 * ADR 0004 proíbe, e reduzir para 256 px joga fora justamente o detalhe pelo
 * qual se pagou o download. Este pacote já chega entre 128 e 512 px, que é a
 * faixa que a ADR pede, de concreto, metal enferrujado e chapa. `docs/asset-licenses.md`
 * já o registrava como "o conjunto de textura interessa muito"; é este o uso.
 *
 * **Uma textura por camada do blockout**, e não uma por bloco: as quatro
 * camadas (`shell`, `ground`, `mid`, `top`) são o que faz a verticalidade da
 * arena legível, e dar superfície diferente a cada uma reforça a mesma leitura
 * que a cor já fazia sozinha. Quem liga arquivo a camada é
 * `greyboxSurfaces.ts`, não este script.
 *
 * **`magick` e não uma biblioteca de node**: é a mesma escolha do
 * `convert-medals.mjs` e do `logo.webp`.
 */
const SOURCE_DIR = new URL('../assets/source/scene/cyberpunk-building/textures/', import.meta.url)
const TARGET_DIR = new URL('../packages/client/public/assets/textures/', import.meta.url)

/**
 * O teto da faixa da ADR 0004 (128 a 256 px). 256 e não 128 porque estas
 * texturas cobrem parede de 64 m: no ladrilho de 4 m que `greyboxSurfaces.ts`
 * usa, 128 px dariam 32 px por metro, e a 2 m de distância o jogador conta os
 * pixels. É também o tamanho em que o `flattenPbrMaterial` já põe filtro
 * nearest, que é a outra metade da receita ps1.
 */
const TEXTURE_SIZE_PX = 256

/**
 * Origem de cada superfície, escolhida por contraste entre camadas vizinhas:
 * concreto embaixo, metal em cima, e o mais claro no meio do caminho para o
 * deck não sumir contra o piso.
 */
const SURFACES = {
  'concrete-panel': 'conc02.png',
  'concrete-slab': 'concrete03.jpeg',
  'metal-rusted': 'metal_ol.png',
  'metal-plate': 'Plataforma_velha.png',
}

mkdirSync(TARGET_DIR, { recursive: true })
report(Object.entries(SURFACES).map(([surface, file]) => convert(surface, file)))

function convert(surface, file) {
  const source = new URL(file, SOURCE_DIR)
  const target = new URL(`${surface}.webp`, TARGET_DIR)
  execFileSync('magick', tileArgs(source.pathname, target.pathname))
  return { surface, bytes: statSync(target).size }
}

/**
 * `-resize` com `!` força o quadrado: duas das quatro origens não são
 * quadradas (500 × 500 e 300 × 300 são, mas o pacote tem vizinhas de 174 × 511),
 * e textura de ladrilho que chega retangular fica esticada numa direção só.
 *
 * `-strip` tira o perfil de cor e o exif, que não servem para nada num
 * ladrilho e são dezenas de kB.
 */
function tileArgs(source, target) {
  return [
    source,
    '-strip',
    '-resize',
    `${TEXTURE_SIZE_PX}x${TEXTURE_SIZE_PX}!`,
    '-quality',
    '82',
    target,
  ]
}

function report(converted) {
  console.log(
    JSON.stringify({
      target: TARGET_DIR.pathname,
      sizePx: TEXTURE_SIZE_PX,
      surfaces: Object.fromEntries(converted.map(({ surface, bytes }) => [surface, bytes])),
      totalBytes: converted.reduce((total, { bytes }) => total + bytes, 0),
    }),
  )
}
