#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'

/**
 * Leva o áudio de `audio/` para `public/assets/audio/`, no formato que cabe no
 * orçamento de download do [nfr](../docs/nfr.md). A origem fica versionada — é
 * pequena o bastante para isso, ao contrário de `assets/` —, mas nada dela é
 * servido cru: mp3 de 192 kbps estéreo e wav sem compressão são o formato
 * errado para os cinco segundos do pilar 2.
 *
 *   node scripts/convert-audio.mjs
 *
 * As três trilhas, e por que cada uma é tratada diferente:
 * - **música** vira opus de 96 kbps estéreo. É a conta que o
 *   `docs/asset-licenses.md` já registrava: corta o peso por dois sem
 *   diferença audível em música de fundo.
 * - **efeito** vira opus de 64 kbps **mono**. Nenhum deles é posicional hoje —
 *   são o tiro, o passo e a luneta do próprio jogador —, e estéreo neles é o
 *   dobro do byte por nada.
 * - **voicelines** são **copiadas**. A bancada do narrador
 *   (`scripts/narrator/encode.py`) já entrega opus mono em webm; reencodar
 *   seria perder qualidade de graça.
 */
const SOURCE_DIR = new URL('../audio/', import.meta.url)
const TARGET_DIR = new URL('../packages/client/public/assets/audio/', import.meta.url)

const MUSIC_KBPS = 96
const SFX_KBPS = 64

mkdirSync(TARGET_DIR.pathname, { recursive: true })
const music = encodeFolder('musics', 'music', '.mp3', ['-ac', '2', '-b:a', `${MUSIC_KBPS}k`])
const sfx = encodeFolder('sfx', 'sfx', '.wav', ['-ac', '1', '-b:a', `${SFX_KBPS}k`])
const voicelines = copyVoicelines()
report({ music, sfx, voicelines })

function encodeFolder(from, to, extension, options) {
  const sourceFolder = new URL(`${from}/`, SOURCE_DIR)
  const targetFolder = new URL(`${to}/`, TARGET_DIR)
  mkdirSync(targetFolder.pathname, { recursive: true })
  return readdirSync(sourceFolder.pathname)
    .filter((file) => file.endsWith(extension))
    .map((file) => encode(new URL(file, sourceFolder), targetFolder, extension, options))
}

function encode(source, targetFolder, extension, options) {
  const name = source.pathname.split('/').at(-1).slice(0, -extension.length)
  const target = new URL(`${name}.webm`, targetFolder)
  // `-map_metadata -1`: a tag do mp3 não serve para nada no navegador e vai
  // junto no download.
  const args = ['-v', 'error', '-y', '-i', source.pathname, '-map_metadata', '-1']
  execFileSync('ffmpeg', [...args, '-c:a', 'libopus', ...options, target.pathname])
  return { name, from: statSync(source.pathname).size, to: statSync(target.pathname).size }
}

/**
 * Uma pasta por voz, com o `manifest.json` junto: é o índice que o cliente lê
 * para achar os takes de um slug, e ele nunca monta nome de arquivo sozinho.
 */
function copyVoicelines() {
  const sourceFolder = new URL('voicelines/', SOURCE_DIR)
  const targetFolder = new URL('voicelines/', TARGET_DIR)
  rmSync(targetFolder.pathname, { recursive: true, force: true })
  cpSync(sourceFolder.pathname, targetFolder.pathname, { recursive: true })
  return readdirSync(targetFolder.pathname).map((voice) => ({
    name: voice,
    clips: readdirSync(new URL(`${voice}/`, targetFolder).pathname).length - 1,
  }))
}

function report(converted) {
  const total = (files) => files.reduce((sum, file) => sum + file.to, 0)
  console.log(
    JSON.stringify({
      target: TARGET_DIR.pathname,
      music: { files: converted.music.length, bytes: total(converted.music) },
      sfx: { files: converted.sfx.length, bytes: total(converted.sfx) },
      voicelines: converted.voicelines,
    }),
  )
}
