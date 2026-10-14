import '@babylonjs/core/Sprites/spriteSceneComponent'
import { Constants } from '@babylonjs/core/Engines/constants'
import { Sprite } from '@babylonjs/core/Sprites/sprite'
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager'
import type { Scene } from '@babylonjs/core/scene'
import { createSeededRandom, type SeededRandom, type Vector3 } from '@shobu/core'
import { SCENE_GROUP } from './arenaSky.ts'
import {
  advanceEffects,
  type BurstLook,
  type BurstSpec,
  burstLook,
  claimEffect,
  createBurstLook,
  createEffectPool,
  type EffectPool,
  type EffectSlot,
  isLive,
} from './shotEffects.ts'
import { SHOT_TEXTURE_DIR } from './shotMaterials.ts'
import { WORLD_LAYER } from './viewmodelCamera.ts'

/**
 * As células de `shot-sprites.png`, na ordem em que
 * `scripts/build-shot-sprites.mjs` as desenha.
 */
export const SHOT_SPRITE_CELL = {
  spark: 0,
  bodyHit: 1,
  glow: 2,
  smoke: 3,
} as const

export type ShotSpriteCell = (typeof SHOT_SPRITE_CELL)[keyof typeof SHOT_SPRITE_CELL]

/** Luz somada (faísca, acerto, halo) ou fumaça, que cobre em vez de somar. */
export type ShotSpriteBlend = 'light' | 'smoke'

/**
 * Os estouros do tiro que encaram a câmera: faísca e halo na parede, acerto
 * no corpo, halo e fumaça na boca do cano dos bots. Sem teste: é adapter puro
 * de engine (ADR 0001); a vida e as curvas moram em `shotEffects.ts`.
 *
 * **Dois `SpriteManager`, duas chamadas de desenho para todos os estouros
 * do jogo**, por mais tiros que haja: um soma luz, o outro mistura fumaça.
 * Os sprites nascem todos na criação e só trocam de posição e cor — nada
 * aloca por disparo nem por quadro. No óculos cada olho desenha os
 * sprites virados para si, que é o que um sprite já faz.
 */
export interface ShotSprites {
  /** Acende um estouro em `positionM`. `intensity` multiplica o alpha (menos movimento, menos luz). */
  burst(
    blend: ShotSpriteBlend,
    cell: ShotSpriteCell,
    spec: BurstSpec,
    positionM: Readonly<Vector3>,
    intensity: number,
  ): void
  /** Todo quadro: anima os vivos e esconde quem acabou. */
  advance(dtS: number): void
}

/** Quantos estouros de luz cabem vivos de uma vez: halo, faísca e brasa por tiro, com folga. */
const LIGHT_CAPACITY = 32
const SMOKE_CAPACITY = 12

/** A célula do atlas, em px: contrato com o gerador. */
const CELL_PX = 128

/** Uma camada: a piscina, os sprites e o que cada slot está desenhando. */
interface SpriteLayer {
  readonly pool: EffectPool
  readonly sprites: readonly Sprite[]
  readonly specs: BurstSpec[]
  readonly origins: Vector3[]
  readonly intensities: number[]
}

export function createShotSprites(scene: Scene): ShotSprites {
  const layers: Record<ShotSpriteBlend, SpriteLayer> = {
    light: createLayer(scene, 'shot-light', LIGHT_CAPACITY, Constants.ALPHA_ADD),
    smoke: createLayer(scene, 'shot-smoke', SMOKE_CAPACITY, Constants.ALPHA_COMBINE),
  }
  // enfeite do cliente: giro e escala não precisam da semente do tiro.
  const random = createSeededRandom(0x5407)
  const look = createBurstLook()
  return {
    burst: (blend, cell, spec, positionM, intensity) =>
      lightUp(layers[blend], random, cell, spec, positionM, intensity),
    advance: (dtS) => {
      animateLayer(layers.light, dtS, look)
      animateLayer(layers.smoke, dtS, look)
    },
  }
}

function createLayer(scene: Scene, name: string, capacity: number, blendMode: number): SpriteLayer {
  const manager = new SpriteManager(
    name,
    `${SHOT_TEXTURE_DIR}shot-sprites.png`,
    capacity,
    CELL_PX,
    scene,
  )
  manager.blendMode = blendMode
  manager.disableDepthWrite = true
  manager.isPickable = false
  // só a câmera do mundo e os olhos do óculos: a da arma não vê o cenário.
  manager.layerMask = WORLD_LAYER
  // sprite não passa pelo `onNewMeshAddedObservable` do céu: sem isto ficava
  // no grupo da cúpula, cujo depth o grupo da cena limpa e cobre — o estouro
  // era desenhado e sumia atrás de tudo (medido no headless, 12/10).
  manager.renderingGroupId = SCENE_GROUP
  return {
    pool: createEffectPool(capacity),
    sprites: Array.from({ length: capacity }, (_, index) => hiddenSprite(manager, index)),
    specs: Array.from({ length: capacity }, () => SPEC_NONE),
    origins: Array.from({ length: capacity }, () => ({ x: 0, y: 0, z: 0 })),
    intensities: Array.from({ length: capacity }, () => 0),
  }
}

function hiddenSprite(manager: SpriteManager, index: number): Sprite {
  const sprite = new Sprite(`${manager.name}-${index}`, manager)
  sprite.isVisible = false
  return sprite
}

/** O que o slot desenha antes do primeiro estouro: nada, por um instante. */
const SPEC_NONE: BurstSpec = {
  lifeS: 1,
  sizeFromM: 0,
  sizeToM: 0,
  peakAlpha: 0,
  riseMps: 0,
  soft: false,
}

/** Parâmetros soltos, e não um objeto: roda por disparo, e não deve alocar. */
function lightUp(
  layer: SpriteLayer,
  random: SeededRandom,
  cell: ShotSpriteCell,
  spec: BurstSpec,
  positionM: Readonly<Vector3>,
  intensity: number,
): void {
  const index = claimEffect(layer.pool, spec.lifeS, random)
  const sprite = layer.sprites[index] as Sprite
  const origin = layer.origins[index] as Vector3
  origin.x = positionM.x
  origin.y = positionM.y
  origin.z = positionM.z
  layer.specs[index] = spec
  layer.intensities[index] = intensity
  sprite.cellIndex = cell
  sprite.angle = (layer.pool.slots[index] as EffectSlot).roll
}

function animateLayer(layer: SpriteLayer, dtS: number, look: BurstLook): void {
  advanceEffects(layer.pool, dtS)
  for (let index = 0; index < layer.sprites.length; index += 1) {
    const sprite = layer.sprites[index] as Sprite
    const slot = layer.pool.slots[index] as EffectSlot
    if (!isLive(slot)) {
      sprite.isVisible = false
      continue
    }
    drawBurst(sprite, slot, layer, index, look)
  }
}

function drawBurst(
  sprite: Sprite,
  slot: Readonly<EffectSlot>,
  layer: SpriteLayer,
  index: number,
  look: BurstLook,
): void {
  burstLook(layer.specs[index] as BurstSpec, slot.ageS, look)
  const origin = layer.origins[index] as Vector3
  sprite.position.set(origin.x, origin.y + look.riseM, origin.z)
  sprite.size = look.sizeM * slot.scale
  sprite.color.set(1, 1, 1, look.alpha * (layer.intensities[index] as number))
  sprite.isVisible = true
}
