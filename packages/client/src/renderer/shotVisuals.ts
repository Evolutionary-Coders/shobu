import type { Scene } from '@babylonjs/core/scene'
import { normalizeInPlace, type StaticBox, type Vector3 } from '@shobu/core'
import { type BulletDecals, createBulletDecals } from './bulletDecals.ts'
import { wallNormalAt } from './impactSurface.ts'
import {
  BODY_HIT,
  flashIntensity,
  IMPACT_GLOW,
  MUZZLE_GLOW,
  MUZZLE_SMOKE,
  WALL_DUST,
  WALL_EMBER,
  WALL_SPARK,
} from './shotEffects.ts'
import { createShotSprites, SHOT_SPRITE_CELL, type ShotSprites } from './shotSprites.ts'
import { createTracerBeams, type TracerBeams } from './tracerBeams.ts'

/**
 * Tudo o que um tiro desenha no mundo, atrás de uma porta só: o feixe, o
 * impacto no fim dele e, para quem atira de fora da primeira pessoa, o halo e
 * a fumaça da boca do cano. O clarão do cano é `muzzleFlashMesh.ts`, porque o
 * do jogador é da arma, não do mundo.
 *
 * Sem teste: é a composição de adapters (ADR 0001). A decisão de **qual**
 * impacto — corpo, parede ou nada — mora em `wallNormalAt` e no `hitFighter`
 * do tiro, testados.
 */
export interface ShotVisuals {
  /** Um tiro de `fromM` (o cano) a `toM` (o fim). `hitFighter` troca a faísca pelo acerto no corpo. */
  fire(fromM: Readonly<Vector3>, toM: Readonly<Vector3>, hitFighter: boolean): number
  /** Leva o começo do feixe devolvido por `fire` para o cano de agora (`TracerBeams.anchor`). */
  anchorTracer(index: number, fromM: Readonly<Vector3>): void
  /** O halo e a fumaça no cano de um atirador visto de fora. */
  muzzleBurst(muzzleM: Readonly<Vector3>): void
  /** Todo quadro. */
  advance(dtS: number): void
  /**
   * Desenha cada material uma vez, invisível, atrás do menu: sem isto o
   * primeiro tiro da partida pagava a compilação dos shaders num quadro só
   * (ver `warmUpBeams` em `driveArenaWeapon.ts`).
   */
  warmUp(fromM: Readonly<Vector3>, toM: Readonly<Vector3>): void
}

export interface ShotVisualsOptions {
  readonly tracerPoolSize: number
  readonly tracerLifetimeS: number
  readonly boxes: readonly StaticBox[]
  /** Onde o olho está agora: a fita do feixe vira para ele. */
  readonly eyeM: () => Readonly<Vector3> | undefined
  readonly reducedMotion: boolean
}

/** O pó sai um palmo da parede, senão metade dele fica enterrada nela. */
const DUST_LIFT_M = 0.08

export function createShotVisuals(scene: Scene, options: ShotVisualsOptions): ShotVisuals {
  const { tracerPoolSize, tracerLifetimeS, eyeM } = options
  const parts: ShotParts = {
    beams: createTracerBeams(scene, tracerPoolSize, tracerLifetimeS, eyeM),
    sprites: createShotSprites(scene),
    decals: createBulletDecals(scene),
    boxes: options.boxes,
    intensity: flashIntensity(options.reducedMotion),
  }
  return {
    fire: (fromM, toM, hitFighter) => {
      land(parts, fromM, toM, hitFighter)
      return parts.beams.fire(fromM, toM)
    },
    anchorTracer: (index, fromM) => parts.beams.anchor(index, fromM),
    muzzleBurst: (muzzleM) => burstAtMuzzle(parts, muzzleM),
    advance: (dtS) => {
      parts.beams.advance(dtS)
      parts.sprites.advance(dtS)
      parts.decals.advance(dtS)
    },
    warmUp: (fromM, toM) => warmUp(parts, fromM, toM),
  }
}

function burstAtMuzzle(parts: ShotParts, muzzleM: Readonly<Vector3>): void {
  parts.sprites.burst('light', SHOT_SPRITE_CELL.glow, MUZZLE_GLOW, muzzleM, parts.intensity)
  parts.sprites.burst('smoke', SHOT_SPRITE_CELL.smoke, MUZZLE_SMOKE, muzzleM, 1)
}

interface ShotParts {
  readonly beams: TracerBeams
  readonly sprites: ShotSprites
  readonly decals: BulletDecals
  readonly boxes: readonly StaticBox[]
  readonly intensity: number
}

// rascunho do módulo: um impacto por tiro, e nada aloca no caminho do disparo.
const direction: Vector3 = { x: 0, y: 0, z: 0 }
const normal: Vector3 = { x: 0, y: 0, z: 0 }
const lifted: Vector3 = { x: 0, y: 0, z: 0 }

/**
 * O fim do tiro: no corpo, o hexágono de acerto; na parede, faísca, halo,
 * pó, brasa e furo; no céu, nada — não há onde a bala bater.
 */
function land(
  parts: ShotParts,
  fromM: Readonly<Vector3>,
  toM: Readonly<Vector3>,
  hitFighter: boolean,
): void {
  direction.x = toM.x - fromM.x
  direction.y = toM.y - fromM.y
  direction.z = toM.z - fromM.z
  normalizeInPlace(direction)
  if (hitFighter) {
    // para fora do corpo, na direção de quem atirou: o sprite cravado no
    // meio do boneco sumia pela metade dentro dele.
    liftFrom(toM, direction, -BODY_LIFT_M)
    parts.sprites.burst('light', SHOT_SPRITE_CELL.bodyHit, BODY_HIT, lifted, parts.intensity)
    return
  }
  if (wallNormalAt(toM, direction, parts.boxes, normal)) landOnWall(parts, toM)
}

/**
 * Quanto cada estouro sai da superfície, em metros. Um sprite encara a
 * câmera: com o centro **na** parede vista de frente, ele fica no plano dela
 * e briga com ela no depth; visto de lado, metade fica enterrada.
 */
const LIGHT_LIFT_M = 0.12
const EMBER_LIFT_M = 0.04
const BODY_LIFT_M = 0.45

function landOnWall(parts: ShotParts, toM: Readonly<Vector3>): void {
  const { sprites, intensity } = parts
  liftFrom(toM, normal, LIGHT_LIFT_M)
  sprites.burst('light', SHOT_SPRITE_CELL.glow, IMPACT_GLOW, lifted, intensity)
  sprites.burst('light', SHOT_SPRITE_CELL.spark, WALL_SPARK, lifted, intensity)
  liftFrom(toM, normal, DUST_LIFT_M)
  sprites.burst('smoke', SHOT_SPRITE_CELL.smoke, WALL_DUST, lifted, 1)
  liftFrom(toM, normal, EMBER_LIFT_M)
  sprites.burst('light', SHOT_SPRITE_CELL.glow, WALL_EMBER, lifted, 1)
  parts.decals.stamp(toM, normal)
}

/** `lifted = pointM + axis × distanceM`. */
function liftFrom(pointM: Readonly<Vector3>, axis: Readonly<Vector3>, distanceM: number): void {
  lifted.x = pointM.x + axis.x * distanceM
  lifted.y = pointM.y + axis.y * distanceM
  lifted.z = pointM.z + axis.z * distanceM
}

/** Um feixe, um estouro de cada camada com intensidade zero e um furo que já nasce no fim. */
function warmUp(parts: ShotParts, fromM: Readonly<Vector3>, toM: Readonly<Vector3>): void {
  parts.beams.fire(fromM, toM)
  parts.sprites.burst('light', SHOT_SPRITE_CELL.spark, WALL_SPARK, toM, 0)
  parts.sprites.burst('smoke', SHOT_SPRITE_CELL.smoke, WALL_DUST, toM, 0)
  parts.decals.warmUp(toM)
}
