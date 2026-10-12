#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { arenaArtPalette } from '../packages/client/src/arena/arenaArtPalette.ts'
import { arenaMapById, DEFAULT_ARENA_ID } from '../packages/client/src/arena/arenaCatalog.ts'
import { SCENERY_MATERIAL_PREFIXES } from '../packages/client/src/arena/arenaScenery.ts'
import { sunTravelDirection } from '../packages/client/src/arena/daySky.ts'
import { layoutFingerprint } from '../packages/client/src/arena/layoutFingerprint.ts'

/**
 * Exporta o layout da arena para o build de arte do blender (ADR 0010):
 *
 *   npm run export:arena-layout                 # o mapa padrão (Ichiban-gai)
 *   npm run export:arena-layout -- neon-kaido   # qualquer mapa do catálogo
 *
 * O node lê o `.ts` do layout direto, sem build — é o mesmo arquivo que o
 * núcleo usa para colisão, então o blender nunca modela uma caixa que a
 * colisão não conhece. O json sai em `assets/work/`, fora do git: é
 * intermediário, e se regenera em milissegundos.
 *
 * Leva junto o sol e o céu de `daySky.ts`, porque o bake tem que usar o mesmo
 * sol que ilumina o personagem em tempo real; a paleta testada de
 * `arenaArtPalette.ts`; e a impressão digital do layout, que o blender grava no
 * manifesto da arte para o teste saber se ela está atualizada.
 */

const map = arenaMapById(process.argv[2] ?? DEFAULT_ARENA_ID)
const TARGET = new URL(`../assets/work/arena/${map.id}.layout.json`, import.meta.url)
const TEXTURE_MANIFEST = new URL('../config/textures.json', import.meta.url)

/**
 * As texturas de detalhe de cada superfície, do manifesto de `fetch:textures`.
 * O manifesto é a fonte: qual banco, qual asset e quantos metros cobre um
 * ladrilho. Aqui só se escolhe a parte que o blender usa.
 */
function arenaTextures() {
  const manifest = JSON.parse(readFileSync(TEXTURE_MANIFEST, 'utf8'))
  return manifest.textures
    .filter((texture) => texture.target === 'arena-art')
    .map(({ name, surface, metresPerTile }) => ({
      surface,
      metresPerTile,
      file: `assets/work/arena/textures/${name}.png`,
    }))
}

function corners(block) {
  const [cx, cy, cz] = block.centerM
  const [sx, sy, sz] = block.sizeM
  return {
    minM: [cx - sx / 2, cy - sy / 2, cz - sz / 2],
    maxM: [cx + sx / 2, cy + sy / 2, cz + sz / 2],
  }
}

const { sky } = map.atmosphere()
const layout = {
  $comment: `gerado por scripts/export-arena-layout.mjs a partir do mapa ${map.id}; não editar`,
  id: map.id,
  fingerprint: layoutFingerprint(map.blockout),
  blocks: map.blockout.map((block) => ({
    name: block.name,
    layer: block.layer,
    zone: block.zone,
    ...corners(block),
  })),
  spawnsEyeM: map.spawnPointsM,
  sun: { travel: sunTravelDirection(sky), rgb: sky.sunRgb },
  sky: { zenithRgb: sky.zenithRgb, horizonRgb: sky.horizonRgb },
  palette: arenaArtPalette(),
  materialPrefixes: SCENERY_MATERIAL_PREFIXES,
  textures: arenaTextures(),
}

mkdirSync(new URL('./', TARGET), { recursive: true })
writeFileSync(TARGET, `${JSON.stringify(layout, null, 2)}\n`)
console.log(`${layout.blocks.length} blocos → ${TARGET.pathname}`)
