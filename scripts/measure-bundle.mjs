#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

/**
 * A primeira medição do projeto (nfr.md): o bundle é o diagnóstico dos cinco
 * segundos do pilar 2, e é o gatilho de revisão da ADR 0001. Não existe teto
 * escrito — o teto é o requisito de 5 s, e este script dá o número.
 *
 * O que importa é a coluna **crítico**: o que o navegador precisa baixar antes
 * do primeiro frame. O babylon carrega loader de textura por import dinâmico,
 * e somar esses pedaços ao total infla o diagnóstico com peso que nunca chega
 * a ser baixado nesta cena.
 */
const DIST = new URL('../packages/client/dist/', import.meta.url).pathname
const MANIFEST = join(DIST, '.vite/manifest.json')

function criticalFiles() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const entry = Object.values(manifest).find((chunk) => chunk.isEntry)
  if (!entry) throw new Error(`${MANIFEST} não tem chunk com isEntry; esperado um ponto de entrada`)
  const reached = new Set()
  collectStaticImports(manifest, entry, reached)
  return reached
}

/** `imports` é import estático; `dynamicImports` é o que fica fora do caminho crítico. */
function collectStaticImports(manifest, chunk, reached) {
  for (const file of [chunk.file, ...(chunk.css ?? [])]) reached.add(file)
  for (const key of chunk.imports ?? []) {
    const imported = manifest[key]
    if (imported && !reached.has(imported.file)) collectStaticImports(manifest, imported, reached)
  }
}

function bundleFiles() {
  return readdirSync(DIST, { recursive: true, encoding: 'utf8' }).filter(
    (entry) => /\.(js|css)$/.test(entry) && statSync(join(DIST, entry)).isFile(),
  )
}

/** Imagem, som e modelo competem pelos mesmos 5 s que o javascript (nfr.md). */
function staticAssetFiles() {
  return readdirSync(DIST, { recursive: true, encoding: 'utf8' })
    .filter((entry) => /\.(webp|png|jpg|glb|gltf|mp3|ogg|woff2)$/.test(entry))
    .filter((entry) => statSync(join(DIST, entry)).isFile())
}

function measure(file) {
  const bytes = readFileSync(join(DIST, file))
  return {
    file,
    raw: bytes.byteLength,
    gzip: gzipSync(bytes).byteLength,
    brotli: brotliCompressSync(bytes).byteLength,
  }
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`

function total(rows) {
  return rows.reduce((sum, row) => sum + row.gzip, 0)
}

function report(rows, critical) {
  console.table(
    rows.map((row) => ({
      arquivo: row.file,
      caminho: critical.has(row.file) ? 'crítico' : 'sob demanda',
      cru: kb(row.raw),
      gzip: kb(row.gzip),
      brotli: kb(row.brotli),
    })),
  )
  const criticalRows = rows.filter((row) => critical.has(row.file))
  const assets = staticAssetFiles().map((file) => statSync(join(DIST, file)).size)
  const assetBytes = assets.reduce((sum, size) => sum + size, 0)
  console.log(`crítico (antes do primeiro frame): ${kb(total(criticalRows))} gzip`)
  console.log(`sob demanda: ${kb(total(rows) - total(criticalRows))} gzip`)
  console.log(`estáticos (${assets.length} imagem/som/modelo): ${kb(assetBytes)} já comprimidos`)
  console.log('\nreferência da adr 0001: pacote umd completo do babylon ~1,4 mb.')
  console.log('o requisito é o pilar 2 (5 s até o controle), não um teto de bundle.')
}

execFileSync('npm', ['run', 'build'], { stdio: 'inherit' })
report(bundleFiles().map(measure), criticalFiles())
