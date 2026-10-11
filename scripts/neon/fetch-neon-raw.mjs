#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Baixa o material bruto do mapa cyberpunk (look-dev de 11/10) da Poly Haven:
 *
 *   npm run fetch:neon-raw
 *
 * Pelo mesmo motivo de `fetch-textures.mjs`: asset que entra por comando solto
 * não deixa rastro, e o manifesto (`config/neon-raw-assets.json`) é o que
 * permite refazer o conjunto numa máquina limpa. Vai para `assets/raw/`, fora
 * do git (ADR 0004); o que o jogo carrega sai dali pelo build do blender.
 *
 * Só Poly Haven, e por isso só CC0: o arquivo vem por url direta da api
 * pública, sem conta nem chave.
 */

const ROOT = new URL('../../', import.meta.url)
const MANIFEST = new URL('config/neon-raw-assets.json', ROOT)
const RAW_DIR = new URL('assets/raw/polyhaven/', ROOT)

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
for (const texture of manifest.textures) await fetchTexture(texture.assetId)
for (const model of manifest.models) await fetchModel(model.assetId)

async function fetchTexture(assetId) {
  const files = await readJson(`https://api.polyhaven.com/files/${assetId}`)
  for (const map of manifest.textureMaps) {
    const file = files[map]?.[manifest.textureResolution]?.jpg
    if (!file) {
      throw new Error(
        `polyhaven ${assetId} sem ${map}/${manifest.textureResolution}/jpg; tem ${Object.keys(files).join(', ')}`,
      )
    }
    await download(file.url, new URL(`${assetId}/${file.url.split('/').pop()}`, RAW_DIR))
  }
}

async function fetchModel(assetId) {
  const gltf = (await readJson(`https://api.polyhaven.com/files/${assetId}`)).gltf?.[
    manifest.modelResolution
  ]?.gltf
  if (!gltf)
    throw new Error(`polyhaven ${assetId} sem gltf/${manifest.modelResolution}; esperado um modelo`)
  await download(gltf.url, new URL(`${assetId}/${gltf.url.split('/').pop()}`, RAW_DIR))
  for (const [path, include] of Object.entries(gltf.include)) {
    await download(include.url, new URL(`${assetId}/${path}`, RAW_DIR))
  }
}

async function readJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}; esperado 200`)
  return response.json()
}

async function download(url, target) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}; esperado 200`)
  mkdirSync(dirname(target.pathname), { recursive: true })
  writeFileSync(target, Buffer.from(await response.arrayBuffer()))
  console.log(JSON.stringify({ event: 'neon-raw-saved', url, path: target.pathname }))
}
