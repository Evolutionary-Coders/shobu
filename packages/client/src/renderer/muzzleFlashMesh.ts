import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 as BabylonVector3 } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import type { Scene } from '@babylonjs/core/scene'
import { createSeededRandom, type Vector3 } from '@shobu/core'
import { MUZZLE_FLASH_S, muzzleFlashOpacity } from '../character/botRifle.ts'
import { advanceEffects, claimEffect, createEffectPool, type EffectSlot } from './shotEffects.ts'
import { glowMaterial } from './shotMaterials.ts'

/**
 * O clarão da boca do cano: **três quads cruzados numa malha só**, e por isso
 * uma chamada de desenho por clarão aceso. Sem teste: é adapter puro de
 * engine (ADR 0001); a curva do clarão é `muzzleFlashOpacity` e o sorteio de
 * giro e escala é `claimEffect`, os dois testados.
 *
 * - a **estrela**, de frente para o cano (plano xy): é o que o atirador e
 *   quem está na mira veem;
 * - a **chama de lado**, em dois planos (xz e yz) ao longo do cano: é o que
 *   quem está do lado vê. Dois planos em cruz nunca somem de perfil.
 *
 * O +z local é a frente do cano. As duas imagens moram num atlas só
 * (`muzzle-flash.png`): estrela à esquerda, chama à direita.
 */
export interface MuzzleFlash {
  readonly mesh: Mesh
  /** Acende: giro e escala novos a cada tiro. */
  fire(): void
  /** Todo quadro: apaga em `MUZZLE_FLASH_S`. */
  advance(dtS: number): void
  /**
   * Para o clarão solto no mundo (o do bot): na boca do cano, com o +z na
   * mira `aimM` (unitária), mantendo o giro sorteado no `fire`.
   */
  place(positionM: Readonly<Vector3>, aimM: Readonly<Vector3>): void
}

/** O lado da estrela e o comprimento e a largura da chama, em metros. */
export interface MuzzleFlashSize {
  readonly starM: number
  readonly lengthM: number
  readonly widthM: number
}

/** O material do clarão, um só para o jogador e todos os bots. */
export function muzzleFlashMaterial(scene: Scene): StandardMaterial {
  return glowMaterial(scene, 'muzzle-flash', 'muzzle-flash.png', new Color3(1, 1, 1))
}

/**
 * `intensity` multiplica a opacidade: é por onde o pedido de menos movimento
 * chega (`flashIntensity`).
 *
 * ```ts
 * const flash = createMuzzleFlash(scene, material, { starM: 0.3, lengthM: 0.55, widthM: 0.24 }, 1)
 * flash.mesh.parent = rig
 * ```
 */
export function createMuzzleFlash(
  scene: Scene,
  material: StandardMaterial,
  size: MuzzleFlashSize,
  intensity: number,
): MuzzleFlash {
  const mesh = createFlashMesh(scene, material, size)
  const pool = createEffectPool(1)
  const slot = pool.slots[0] as EffectSlot
  // enfeite do cliente: o servidor nunca desenha clarão, e a semente do tiro
  // não precisa entrar aqui.
  const random = createSeededRandom(0xf1a5)
  return {
    mesh,
    fire: () => {
      claimEffect(pool, MUZZLE_FLASH_S, random)
      // o giro em volta do cano e a escala mudam a cada tiro: o mesmo clarão
      // duas vezes é o carimbo que denuncia o sprite.
      mesh.rotation.z = slot.roll
      mesh.scaling.setAll(slot.scale)
    },
    advance: (dtS) => {
      const opacity = muzzleFlashOpacity(slot.lifeS - slot.ageS) * intensity
      advanceEffects(pool, dtS)
      if (mesh.isEnabled(false) !== opacity > 0) mesh.setEnabled(opacity > 0)
      mesh.visibility = opacity
    },
    place: (positionM, aimM) => {
      mesh.position.set(positionM.x, positionM.y, positionM.z)
      target.set(positionM.x + aimM.x, positionM.y + aimM.y, positionM.z + aimM.z)
      mesh.lookAt(target, 0, 0, slot.roll)
    },
  }
}

function createFlashMesh(scene: Scene, material: StandardMaterial, size: MuzzleFlashSize): Mesh {
  const mesh = new Mesh('muzzle-flash', scene)
  flashGeometry(size).applyToMesh(mesh)
  mesh.material = material
  mesh.isPickable = false
  mesh.alwaysSelectAsActiveMesh = true
  mesh.setEnabled(false)
  return mesh
}

/** O ponto para onde o clarão solto olha: rascunho do módulo, um tiro de cada vez. */
const target = new BabylonVector3()

/** A estrela um dedo à frente da boca, para não cortar no cano. */
const STAR_AHEAD_M = 0.02

/**
 * Os doze vértices de uma malha de lado 1 — a estrela em xy, a chama deitada
 * em xz e em pé em yz — que `flashGeometry` escala para o tamanho pedido.
 * Cada vértice diz, eixo a eixo, qual medida o multiplica.
 */
// biome-ignore format: uma linha por vértice é a única forma legível de um quad
const UNIT_CORNERS: readonly (readonly [Axis, Axis, Axis])[] = [
  ['-star', '-star', 'ahead'], ['star', '-star', 'ahead'], ['star', 'star', 'ahead'], ['-star', 'star', 'ahead'],
  ['-wide', 'zero', 'zero'], ['wide', 'zero', 'zero'], ['wide', 'zero', 'long'], ['-wide', 'zero', 'long'],
  ['zero', '-wide', 'zero'], ['zero', 'wide', 'zero'], ['zero', 'wide', 'long'], ['zero', '-wide', 'long'],
]

type Axis = 'star' | '-star' | 'wide' | '-wide' | 'long' | 'ahead' | 'zero'

/** O u da chama corre ao longo do cano, do meio do atlas (a boca) à borda (a ponta). */
// biome-ignore format: um quad por linha
const FLASH_UVS = [
  0, 0, 0.5, 0, 0.5, 1, 0, 1,
  0.5, 0, 0.5, 1, 1, 1, 1, 0,
  0.5, 0, 0.5, 1, 1, 1, 1, 0,
]

const FLASH_INDICES = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11]

function flashGeometry(size: MuzzleFlashSize): VertexData {
  const measure: Record<Axis, number> = {
    star: size.starM / 2,
    '-star': -size.starM / 2,
    wide: size.widthM / 2,
    '-wide': -size.widthM / 2,
    long: size.lengthM,
    ahead: STAR_AHEAD_M,
    zero: 0,
  }
  const data = new VertexData()
  data.positions = UNIT_CORNERS.flatMap((corner) => corner.map((axis) => measure[axis]))
  data.uvs = FLASH_UVS
  data.indices = FLASH_INDICES
  data.normals = []
  VertexData.ComputeNormals(data.positions, data.indices, data.normals)
  return data
}
