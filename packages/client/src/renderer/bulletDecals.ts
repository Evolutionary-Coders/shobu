import '@babylonjs/core/Meshes/thinInstanceMesh'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import { createSeededRandom, type SeededRandom, type Vector3 } from '@shobu/core'
import { DECAL_MATRIX_FLOATS, hideDecal, writeDecalMatrix } from './decalMatrix.ts'
import {
  advanceEffects,
  claimEffect,
  createEffectPool,
  DECAL_FADE_S,
  decalOpacity,
  type EffectPool,
  type EffectSlot,
  isLive,
} from './shotEffects.ts'
import { decalMaterial } from './shotMaterials.ts'

/**
 * Os furos de bala nas paredes: **uma malha, uma chamada de desenho**, com
 * cada furo numa thin instance. Sem teste: é adapter puro de engine (ADR
 * 0001); a matriz sai de `decalMatrix.ts` e a vida de `shotEffects.ts`.
 *
 * Teto fixo: com a piscina cheia o furo novo apaga o mais velho, então uma
 * partida inteira de tiros não acumula nada na cena.
 */
export interface BulletDecals {
  /** Um furo em `positionM`, deitado na face de normal `normalM`. */
  stamp(positionM: Readonly<Vector3>, normalM: Readonly<Vector3>): void
  /** Todo quadro: esmaece os que estão no fim da vida. */
  advance(dtS: number): void
  /**
   * Um furo que já nasce no último quadro da vida: a gpu recebe o programa e
   * os buffers atrás do menu, e o furo some sem ser visto.
   */
  warmUp(positionM: Readonly<Vector3>): void
}

/** Quantos furos ficam na cena ao mesmo tempo. */
const DECAL_CAPACITY = 32
/** Quanto um furo dura, em segundos, contando o esmaecimento. */
const DECAL_LIFE_S = 8
/** O lado do quad do furo, em metros: a coroa de queimado é maior que o furo. */
const DECAL_SIZE_M = 0.16

const COLOR_FLOATS = 4

/** O aquecimento: qualquer normal serve, e o furo vive um quadro. */
const WARM_UP_NORMAL: Readonly<Vector3> = { x: 0, y: 0, z: -1 }
const WARM_UP_LEFT_S = 1 / 60

export function createBulletDecals(scene: Scene): BulletDecals {
  const mesh = CreatePlane('bullet-decals', { size: 1 }, scene)
  mesh.material = decalMaterial(scene, 'bullet-decal', 'bullet-hole.png')
  mesh.isPickable = false
  const matrices = new Float32Array(DECAL_CAPACITY * DECAL_MATRIX_FLOATS)
  const colors = new Float32Array(DECAL_CAPACITY * COLOR_FLOATS).fill(1)
  mesh.thinInstanceSetBuffer('matrix', matrices, DECAL_MATRIX_FLOATS, false)
  mesh.thinInstanceSetBuffer('color', colors, COLOR_FLOATS, false)
  // os furos se espalham pelo mapa: a caixa de recorte da malha-fonte não diz
  // nada, e recalcular a de todas as instâncias por tiro custa mais que
  // desenhar 32 quads fora da tela.
  mesh.alwaysSelectAsActiveMesh = true
  mesh.setEnabled(false)
  const decals: DecalBuffers = { mesh, pool: createEffectPool(DECAL_CAPACITY), matrices, colors }
  const random = createSeededRandom(0xdeca1)
  return {
    stamp: (positionM, normalM) => {
      stampDecal(decals, random, positionM, normalM)
    },
    warmUp: (positionM) => {
      const slot = decals.pool.slots[stampDecal(decals, random, positionM, WARM_UP_NORMAL)]
      if (slot) slot.ageS = slot.lifeS - WARM_UP_LEFT_S
    },
    advance: (dtS) => fadeDecals(decals, dtS),
  }
}

interface DecalBuffers {
  readonly mesh: Mesh
  readonly pool: EffectPool
  readonly matrices: Float32Array
  readonly colors: Float32Array
}

function stampDecal(
  decals: DecalBuffers,
  random: SeededRandom,
  positionM: Readonly<Vector3>,
  normalM: Readonly<Vector3>,
): number {
  const { mesh, pool, matrices, colors } = decals
  const index = claimEffect(pool, DECAL_LIFE_S, random)
  const slot = pool.slots[index] as EffectSlot
  writeDecalMatrix(matrices, index, positionM, normalM, slot.roll, DECAL_SIZE_M * slot.scale)
  colors[index * COLOR_FLOATS + 3] = 1
  mesh.thinInstanceBufferUpdated('matrix')
  mesh.thinInstanceBufferUpdated('color')
  mesh.setEnabled(true)
  return index
}

/**
 * Só reenvia o buffer quando algum furo está esmaecendo ou acabou de
 * acabar: no resto do tempo os furos estão parados, e o buffer na gpu já é o
 * certo. Sem furo nenhum, a malha sai da cena.
 */
function fadeDecals(decals: DecalBuffers, dtS: number): void {
  const { mesh, pool } = decals
  if (!mesh.isEnabled(false)) return
  advanceEffects(pool, dtS)
  let changed = false
  for (let index = 0; index < pool.slots.length; index += 1) {
    if (fadeDecal(decals, index)) changed = true
  }
  if (changed) {
    mesh.thinInstanceBufferUpdated('color')
    mesh.thinInstanceBufferUpdated('matrix')
  }
  if (!pool.slots.some(isLive)) mesh.setEnabled(false)
}

/** Atualiza a opacidade de um furo; devolve se ela mudou. */
function fadeDecal(decals: DecalBuffers, index: number): boolean {
  const slot = decals.pool.slots[index] as EffectSlot
  if (isLive(slot) && slot.lifeS - slot.ageS >= DECAL_FADE_S) return false
  const alphaAt = index * COLOR_FLOATS + 3
  const opacity = decalOpacity(slot)
  if (decals.colors[alphaAt] === opacity) return false
  decals.colors[alphaAt] = opacity
  if (opacity === 0) hideDecal(decals.matrices, index)
  return true
}
