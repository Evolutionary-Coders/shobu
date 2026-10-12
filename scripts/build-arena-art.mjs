#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { arenaMapById, DEFAULT_ARENA_ID } from '../packages/client/src/arena/arenaCatalog.ts'

/**
 * A arte de um mapa do catálogo, de ponta a ponta (ADR 0010):
 *
 *   npm run build:arena-art                 # o mapa padrão
 *   npm run build:arena-art -- ichiban-gai  # qualquer id do catálogo
 *
 * Exporta o layout do `.ts` para json, monta e cozinha no blender
 * (`build_arena.py --map <id>`) e quantiza o glb. O id é conferido no
 * catálogo antes de abrir o blender: id errado é erro com a lista dos que
 * existem, e não meia hora de bake de um mapa que não existe.
 */
const map = arenaMapById(process.argv[2] ?? DEFAULT_ARENA_ID)
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' })

run('node', ['scripts/export-arena-layout.mjs', map.id])
run('blender', ['-b', '-P', 'scripts/blender/build_arena.py', '--', '--map', map.id])
run('node', ['scripts/quantize-arena.mjs', `packages/client/public/assets/arena/${map.id}.glb`])
