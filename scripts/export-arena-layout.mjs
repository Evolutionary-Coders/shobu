#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { arenaArtPalette } from '../packages/client/src/arena/arenaArtPalette.ts'
import { daySkySpec, sunTravelDirection } from '../packages/client/src/arena/daySky.ts'
import {
  ICHIBAN_GAI_BLOCKOUT,
  ICHIBAN_GAI_SPAWN_POINTS_M,
} from '../packages/client/src/arena/ichibanGai.ts'
import { layoutFingerprint } from '../packages/client/src/arena/layoutFingerprint.ts'

/**
 * Exporta o layout da arena para o build de arte do blender (ADR 0010):
 *
 *   npm run export:arena-layout
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

const TARGET = new URL('../assets/work/arena/ichiban-gai.layout.json', import.meta.url)

function corners(block) {
  const [cx, cy, cz] = block.centerM
  const [sx, sy, sz] = block.sizeM
  return {
    minM: [cx - sx / 2, cy - sy / 2, cz - sz / 2],
    maxM: [cx + sx / 2, cy + sy / 2, cz + sz / 2],
  }
}

const sky = daySkySpec()
const layout = {
  $comment: 'gerado por scripts/export-arena-layout.mjs a partir de ichibanGai.ts; não editar',
  fingerprint: layoutFingerprint(ICHIBAN_GAI_BLOCKOUT),
  blocks: ICHIBAN_GAI_BLOCKOUT.map((block) => ({
    name: block.name,
    layer: block.layer,
    zone: block.zone,
    ...corners(block),
  })),
  spawnsEyeM: ICHIBAN_GAI_SPAWN_POINTS_M,
  sun: { travel: sunTravelDirection(sky), rgb: sky.sunRgb },
  sky: { zenithRgb: sky.zenithRgb, horizonRgb: sky.horizonRgb },
  palette: arenaArtPalette(),
}

mkdirSync(new URL('./', TARGET), { recursive: true })
writeFileSync(TARGET, `${JSON.stringify(layout, null, 2)}\n`)
console.log(`${layout.blocks.length} blocos → ${TARGET.pathname}`)
