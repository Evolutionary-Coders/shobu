#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Baixa o material bruto do Neon-kaidō: as texturas e os modelos da Poly
 * Haven e o Car Kit da Kenney (os carros estacionados de `neon_cover.py`):
 *
 *   npm run fetch:neon-raw
 *
 * Pelo mesmo motivo de `fetch-textures.mjs`: asset que entra por comando solto
 * não deixa rastro, e o manifesto (`config/neon-raw-assets.json`) é o que
 * permite refazer o conjunto numa máquina limpa. Vai para `assets/raw/`, fora
 * do git (ADR 0004); o que o jogo carrega sai dali pelo build do blender.
 *
 * Tudo CC0. A Poly Haven entrega por url direta da api pública, sem conta nem
 * chave. A Kenney não tem api: o zip vem da url da página do kit, que muda
 * quando o kit ganha versão — por isso o manifesto fixa o sha256, e um zip
 * diferente é erro em vez de carro diferente no mapa. Descompactar pede o
 * `unzip` do sistema.
 */

const ROOT = new URL('../../', import.meta.url)
const MANIFEST = new URL('config/neon-raw-assets.json', ROOT)
const RAW_DIR = fileURLToPath(new URL('assets/raw/', ROOT))
const POLYHAVEN_DIR = resolve(RAW_DIR, 'polyhaven')

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
for (const texture of manifest.textures) await fetchTexture(texture.assetId)
for (const model of manifest.models) await fetchModel(model.assetId)
for (const archive of manifest.archives) await fetchArchive(archive)

async function fetchTexture(assetId) {
  const files = await readJson(`https://api.polyhaven.com/files/${assetId}`)
  for (const map of manifest.textureMaps) {
    const file = files[map]?.[manifest.textureResolution]?.jpg
    if (!file) {
      throw new Error(
        `polyhaven ${assetId} sem ${map}/${manifest.textureResolution}/jpg; tem ${Object.keys(files).join(', ')}`,
      )
    }
    await download(file.url, insideOf(POLYHAVEN_DIR, `${assetId}/${file.url.split('/').pop()}`))
  }
}

async function fetchModel(assetId) {
  const gltf = (await readJson(`https://api.polyhaven.com/files/${assetId}`)).gltf?.[
    manifest.modelResolution
  ]?.gltf
  if (!gltf)
    throw new Error(`polyhaven ${assetId} sem gltf/${manifest.modelResolution}; esperado um modelo`)
  await download(gltf.url, insideOf(POLYHAVEN_DIR, `${assetId}/${gltf.url.split('/').pop()}`))
  // os caminhos do `include` vêm da api: um `../` neles gravaria fora da pasta do asset.
  for (const [path, include] of Object.entries(gltf.include)) {
    await download(include.url, insideOf(resolve(POLYHAVEN_DIR, assetId), path))
  }
}

/** Um zip de kit (a Kenney), conferido pelo sha256 do manifesto e descompactado. */
async function fetchArchive(archive) {
  const zipPath = insideOf(RAW_DIR, archive.zip)
  const extractDir = insideOf(RAW_DIR, archive.extractTo)
  const bytes = await fetchBytes(archive.url, archive.page)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== archive.sha256) {
    throw new Error(
      `${archive.url} veio com sha256 ${sha256}; esperado ${archive.sha256}. O kit mudou de versão: ` +
        `confira a licença em ${archive.page} e atualize url e sha256 no manifesto`,
    )
  }
  save(zipPath, bytes, archive.url)
  mkdirSync(extractDir, { recursive: true })
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', extractDir], { stdio: 'inherit' })
  console.log(JSON.stringify({ event: 'neon-raw-extracted', zip: zipPath, path: extractDir }))
}

/**
 * O caminho `path` dentro de `base`, ou erro se ele escapar dela.
 *
 * ```js
 * insideOf('/raw/polyhaven/pipe', 'textures/pipe.jpg') // '/raw/polyhaven/pipe/textures/pipe.jpg'
 * insideOf('/raw/polyhaven/pipe', '../../escape.sh')   // lança
 * ```
 */
function insideOf(base, path) {
  const target = resolve(base, path)
  const fromBase = relative(base, target)
  if (
    fromBase === '' ||
    fromBase === '..' ||
    fromBase.startsWith(`..${sep}`) ||
    isAbsolute(fromBase)
  ) {
    throw new Error(
      `caminho ${JSON.stringify(path)} sai de ${base}; esperado um caminho relativo dentro dela`,
    )
  }
  return target
}

async function readJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}; esperado 200`)
  return response.json()
}

async function fetchBytes(url, page) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `${url} respondeu ${response.status}; esperado 200. Pegue a url nova do zip em ${page}`,
    )
  }
  return Buffer.from(await response.arrayBuffer())
}

async function download(url, target) {
  save(target, await fetchBytes(url, url), url)
}

function save(target, bytes, url) {
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, bytes)
  console.log(JSON.stringify({ event: 'neon-raw-saved', url, path: target }))
}
