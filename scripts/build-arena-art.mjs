#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { arenaMapById, DEFAULT_ARENA_ID } from '../packages/client/src/arena/arenaCatalog.ts'

/**
 * A arte de um mapa do catálogo, de ponta a ponta (ADR 0010):
 *
 *   npm run build:arena-art                                   # o mapa padrão (Neon-kaidō)
 *   npm run build:arena-art -- ichiban-gai                    # qualquer id do catálogo
 *   npm run build:arena-art -- ichiban-gai --skip-bake 1 --preview assets/work/arena/preview.png
 *
 * Exporta o layout do `.ts` para json, monta e cozinha no blender
 * (`build_arena.py --map <id>`) e quantiza o glb. O id é conferido no
 * catálogo antes de abrir o blender: id errado é erro com a lista dos que
 * existem, e não meia hora de bake de um mapa que não existe.
 *
 * O id é o único argumento solto; o resto vai em pares `--flag valor` direto
 * para o `build_arena.py`. Antes, `--skip-bake` chegava ao catálogo como id.
 * Sem bake, o glb não muda, e a quantização é pulada.
 */
const { mapId, blenderFlags } = splitArguments(process.argv.slice(2))
const map = arenaMapById(mapId ?? DEFAULT_ARENA_ID)
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' })

run('node', ['scripts/export-arena-layout.mjs', map.id])
run('blender', [
  '-b',
  '-P',
  'scripts/blender/build_arena.py',
  '--',
  '--map',
  map.id,
  ...blenderFlags,
])
if (!blenderFlags.includes('--skip-bake')) {
  run('node', ['scripts/quantize-arena.mjs', `packages/client/public/assets/arena/${map.id}.glb`])
}

/**
 * Separa o id do mapa (posicional, opcional) dos pares `--flag valor`.
 *
 * ```js
 * splitArguments(['neon-kaido', '--skip-bake', '1'])
 * // { mapId: 'neon-kaido', blenderFlags: ['--skip-bake', '1'] }
 * ```
 */
function splitArguments(args) {
  const positional = []
  const blenderFlags = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const value = args[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`a flag ${arg} veio sem valor; esperado par "${arg} <valor>"`)
    }
    blenderFlags.push(arg, value)
    index += 1
  }
  if (positional.length > 1) {
    throw new Error(
      `recebi ${positional.length} ids (${positional.join(', ')}); esperado no máximo um`,
    )
  }
  return { mapId: positional[0], blenderFlags }
}
