import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import type { Scene } from '@babylonjs/core/scene'
import type { RibbonAxes } from './ribbonAxes.ts'

/**
 * A fita do rastro: um quad de largura `widthM` e comprimento 1, de z = 0 a
 * z = 1, deitado no plano xz. Quem a vira para o olho é `aimRibbon`, quadro a
 * quadro. Sem teste: é adapter puro de engine (ADR 0001); os eixos saem de
 * `ribbonAxes.ts`, que é testado.
 *
 * O u da textura corre ao longo do feixe e o v atravessa a largura — o perfil
 * de `tracer-profile.png` é desenhado em v.
 *
 * ```ts
 * const halo = createRibbon(scene, 'tracer-halo', haloMaterial, 0.09)
 * ```
 */
export function createRibbon(
  scene: Scene,
  name: string,
  material: StandardMaterial,
  widthM: number,
): Mesh {
  const ribbon = new Mesh(name, scene)
  const half = widthM / 2
  const quad = new VertexData()
  quad.positions = [-half, 0, 0, half, 0, 0, half, 0, 1, -half, 0, 1]
  quad.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]
  quad.uvs = [0, 0, 0, 1, 1, 1, 1, 0]
  quad.indices = [0, 1, 2, 0, 2, 3]
  quad.applyToMesh(ribbon)
  ribbon.material = material
  ribbon.rotationQuaternion = new Quaternion()
  ribbon.isPickable = false
  ribbon.doNotSyncBoundingInfo = true
  // a caixa de recorte de um quad de 1 m não cobre um feixe de 400 m
  // esticado por escala: sem isto o babylon recortava o rastro inteiro assim
  // que o cano saía da tela.
  ribbon.alwaysSelectAsActiveMesh = true
  ribbon.setEnabled(false)
  return ribbon
}

/** Os eixos em vetores do babylon: a rotação lê os campos internos deles, não `x`/`y`/`z`. */
const side = new Vector3()
const facing = new Vector3()
const along = new Vector3()

/**
 * Põe a fita em `fromM`, ao longo de `axes.along`, com a face em
 * `axes.facing`, `lengthM` de comprimento e a largura multiplicada por
 * `widthScale`. Nada aloca: os vetores de rascunho são do módulo.
 *
 * ```ts
 * aimRibbon(halo, from, axes, lengthM, tracerWidthScale(slot, lifetimeS))
 * ```
 */
export function aimRibbon(
  ribbon: Mesh,
  fromM: Readonly<{ x: number; y: number; z: number }>,
  axes: Readonly<RibbonAxes>,
  lengthM: number,
  widthScale: number,
): void {
  side.set(axes.side.x, axes.side.y, axes.side.z)
  facing.set(axes.facing.x, axes.facing.y, axes.facing.z)
  along.set(axes.along.x, axes.along.y, axes.along.z)
  Quaternion.RotationQuaternionFromAxisToRef(
    side,
    facing,
    along,
    ribbon.rotationQuaternion as Quaternion,
  )
  ribbon.position.set(fromM.x, fromM.y, fromM.z)
  ribbon.scaling.set(widthScale, 1, Math.max(lengthM, 1e-3))
  ribbon.setEnabled(true)
}
