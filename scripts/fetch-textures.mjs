#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Baixa textura **CC0** de banco online e converte para o formato que a
 * ADR 0004 pede:
 *
 *   npm run fetch:textures            # baixa tudo que o manifesto lista
 *   npm run fetch:textures -- --list  # só mostra o manifesto
 *   npm run fetch:textures -- --only detail-asphalt
 *
 * **Por que um manifesto e não um comando com url.** Asset que entra por
 * comando de terminal não deixa rastro: seis meses depois ninguém sabe de onde
 * veio o arquivo nem sob que licença, e a ADR 0004 exige exatamente esse
 * registro. O manifesto é `config/textures.json`, está no git, e é ele que
 * permite refazer o conjunto inteiro numa máquina limpa.
 *
 * **Por que só CC0.** Os dois bancos aqui publicam tudo sob CC0 1.0 — sem
 * atribuição obrigatória e com uso comercial liberado. É a única origem de
 * asset de terceiro deste projeto que **sobrevive** se a ADR 0004 cair e o jogo
 * sair do escopo acadêmico. Adicionar um banco que não seja CC0 é decisão de
 * licença, não de conveniência, e não se faz aqui sem passar por uma ADR.
 *
 * **O que estas texturas não são.** Elas não vestem a arena: quem faz isso é
 * `packages/client/src/arena/cyberspaceSurface.ts`, que pinta painel e circuito
 * em código. O que entra por aqui é **detalhe** — microvariação multiplicada
 * por cima do painel gerado, para a superfície não ser matematicamente lisa.
 * É por isso que só a cor é baixada: normal, rugosidade e oclusão são mapas de
 * PBR, e a ADR 0004 proíbe PBR.
 */

const ROOT = new URL('../', import.meta.url)
const MANIFEST = new URL('config/textures.json', ROOT)
const TARGET_DIR = new URL('packages/client/public/assets/textures/', ROOT)

/**
 * De onde cada banco serve o arquivo. Os dois entregam coisas diferentes: a
 * poly haven publica a imagem solta por url direta, e a ambientCG só entrega
 * zip — daí um resolver por banco em vez de uma url montada com template.
 */
const SOURCES = {
  polyhaven: { licence: 'CC0 1.0', home: 'https://polyhaven.com', resolve: resolvePolyHaven },
  ambientcg: { licence: 'CC0 1.0', home: 'https://ambientcg.com', resolve: resolveAmbientCg },
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const only = argumentAfter('--only')
const wanted = manifest.textures.filter((texture) => !only || texture.name === only)

if (process.argv.includes('--list')) {
  for (const texture of manifest.textures) {
    console.log(`${texture.name}\t${texture.source}:${texture.assetId}\t${texture.use}`)
  }
} else {
  await fetchAll()
}

async function fetchAll() {
  if (wanted.length === 0) {
    throw new Error(`--only recebeu '${only}'; esperado um nome de config/textures.json`)
  }
  const rows = []
  for (const texture of wanted) rows.push(await fetchOne(texture))
  console.log(JSON.stringify({ sizePx: manifest.sizePx, textures: rows }, null, 2))
  console.log('\nlinhas para docs/asset-licenses.md:\n')
  for (const row of rows) {
    console.log(
      `| \`textures/${row.name}.webp\` | [${row.source}](${row.home}), \`${row.assetId}\` | **${row.licence}** | ${row.bytes} B |`,
    )
  }
}

async function fetchOne(texture) {
  const source = SOURCES[texture.source]
  if (!source) {
    throw new Error(
      `source recebeu '${texture.source}'; esperado um de ${Object.keys(SOURCES).join(', ')}`,
    )
  }
  const scratch = mkdtempSync(join(tmpdir(), 'shobu-textures-'))
  try {
    const original = await source.resolve(texture, scratch)
    const bytes = convert(original, texture.name)
    return { ...texture, licence: source.licence, home: source.home, bytes }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/** A poly haven publica um json de arquivos por asset, com url direta por mapa. */
async function resolvePolyHaven(texture, scratch) {
  const files = await readJson(`https://api.polyhaven.com/files/${texture.assetId}`)
  const url = files[texture.map]?.[texture.resolution]?.jpg?.url
  if (!url) {
    const maps = Object.keys(files).join(', ')
    throw new Error(
      `polyhaven ${texture.assetId} não tem ${texture.map}/${texture.resolution}/jpg; tem ${maps}`,
    )
  }
  return download(url, join(scratch, 'source.jpg'))
}

/**
 * A ambientCG só entrega zip, e o zip traz a família de mapas inteira. Pegar o
 * `_Color` de dentro dele é mais barato que baixar uma variante por mapa — e é
 * o único que interessa, porque o resto é PBR.
 */
async function resolveAmbientCg(texture, scratch) {
  const file = `${texture.assetId}_${texture.resolution}-JPG.zip`
  const archive = await download(`https://ambientcg.com/get?file=${file}`, join(scratch, file))
  execFileSync('unzip', ['-q', '-o', archive, '-d', scratch])
  const listed = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).split('\n')
  const entry = listed.find((name) => name.includes(`_${texture.map}.`))
  if (!entry) {
    throw new Error(`${file} não traz um arquivo _${texture.map}; traz ${listed.join(', ')}`)
  }
  return join(scratch, entry)
}

async function readJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url} respondeu ${response.status}; esperado 200`)
  }
  return response.json()
}

async function download(url, target) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`${url} respondeu ${response.status}; esperado 200`)
  }
  writeFileSync(target, Buffer.from(await response.arrayBuffer()))
  return target
}

/**
 * Quadrado, pequeno e webp. O `-strip` tira metadado de câmera que não serve
 * para nada num ladrilho, e o corte central evita a distorção que um
 * redimensionamento não proporcional deixaria na emenda do ladrilho.
 */
function convert(original, name) {
  const target = new URL(`${name}.webp`, TARGET_DIR)
  const size = manifest.sizePx
  execFileSync('magick', [
    original,
    '-resize',
    `${size}x${size}^`,
    '-gravity',
    'center',
    '-extent',
    `${size}x${size}`,
    '-strip',
    '-quality',
    '88',
    target.pathname,
  ])
  return readFileSync(target).length
}

function argumentAfter(flag) {
  const at = process.argv.indexOf(flag)
  return at === -1 ? null : process.argv[at + 1]
}
