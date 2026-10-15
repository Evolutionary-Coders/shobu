#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { arenaMapById, DEFAULT_ARENA_ID } from '../packages/client/src/arena/arenaCatalog.ts'
import {
  billboardColliders,
  signColliders,
} from '../packages/client/src/arena/artColliderExtraction.ts'
import { readPublishedGlb } from '../packages/client/src/arena/publishedArenaGlb.ts'

/**
 * Gera a colisão da arte de um mapa (ADR 0024):
 *
 *   npm run export:art-colliders                 # o mapa padrão (Neon-kaidō)
 *   npm run export:art-colliders -- ichiban-gai  # qualquer mapa do catálogo
 *
 * Junta duas fontes, as duas sendo a própria arte:
 *
 * - o que o build do blender decide a partir do layout — platibanda, casa de
 *   máquinas, guarda-corpo —, rodando as funções do build com o blender
 *   trocado por um dublê (`scripts/blender/export_art_colliders.py`);
 * - o que o build sorteia e só o glb publicado guarda — letreiro e telão do
 *   Neon-kaidō (`artColliderExtraction.ts`).
 *
 * Grava `packages/core/src/arena/artColliders/<mapa>.json`. Roda depois de
 * todo `build:arena-art`; o teste do mapa reprova o json que não bate com a
 * arte publicada.
 */
const map = arenaMapById(process.argv[2] ?? DEFAULT_ARENA_ID)
const ROOT = new URL('../', import.meta.url).pathname
const LAYOUT = join(ROOT, `assets/work/arena/${map.id}.layout.json`)
const TARGET = join(ROOT, `packages/core/src/arena/artColliders/${map.id}.json`)

/** O que só o glb publicado guarda, por mapa. */
const FROM_GLB = {
  'neon-kaido': (glb) => [...signColliders(glb, 'letreiros-face'), ...billboardColliders(glb)],
  'ichiban-gai': () => [],
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} saiu com ${result.status}; esperado 0`)
  }
}

function fromBuild() {
  const scratch = mkdtempSync(join(tmpdir(), 'shobu-art-colliders-'))
  try {
    run('node', ['scripts/export-arena-layout.mjs', map.id])
    const out = join(scratch, 'colliders.json')
    run('python3', ['scripts/blender/export_art_colliders.py', LAYOUT, out])
    return JSON.parse(readFileSync(out, 'utf8'))
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

const colliders = [
  ...fromBuild(),
  ...FROM_GLB[map.id](readPublishedGlb(map.sceneryManifest.replace('.json', '.glb'))),
]
writeFileSync(
  TARGET,
  `${JSON.stringify({
    $comment: `gerado por scripts/export-art-colliders.mjs a partir da arte de ${map.id}; não editar`,
    map: map.id,
    colliders,
  })}\n`,
)
run('npx', ['biome', 'format', '--write', TARGET])
console.log(
  JSON.stringify({
    event: 'art-colliders-written',
    map: map.id,
    colliders: colliders.length,
    target: TARGET,
  }),
)
