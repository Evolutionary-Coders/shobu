import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { VertexBuffer } from '@babylonjs/core/Meshes/buffer'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import { additiveMaterial } from './beamMeshes.ts'
import {
  type BladeTrail,
  clearBladeTrail,
  createBladeTrail,
  pushTrailSample,
  TRAIL_SAMPLES,
  trailIndices,
  writeTrailRibbon,
} from './bladeTrail.ts'
import { maskAsViewmodel } from './viewmodelCamera.ts'

/** Os dois pontos da lâmina que a fita segue, no espaço local da malha dela (eixo do glTF). */
export interface TrailAnchors {
  readonly innerM: readonly [number, number, number]
  readonly tipM: readonly [number, number, number]
}

export interface BladeTrailMesh {
  /**
   * Chame todo quadro, **antes** de mexer nos ossos: lê a lâmina no quadro
   * que acabou de ser desenhado (16 ms de atraso, invisível num borrão), e
   * assim não precisa recalcular a cadeia de matrizes do esqueleto.
   */
  update(blade: AbstractMesh | undefined, anchors: TrailAnchors, strength: number): void
  setColor(color: readonly [number, number, number]): void
  /** Liga a fita, apagada, por um quadro: compila o material antes do primeiro corte. */
  warmUp(): void
}

/**
 * A fita de luz do corte (`bladeTrail.ts`), presa ao rig da lâmina: as
 * amostras ficam no espaço do rig, e o balanço da arma a carrega junto. Uma
 * malha de 18 vértices para a vida inteira, desligada fora da janela do
 * rastro. Adapter: a conta da fita é de `bladeTrail.ts`, que é testado.
 *
 * ```ts
 * const trail = createBladeTrailMesh(scene, rig)
 * trail.update(bladeMesh, KATANA_TRAIL, shot.trail)
 * ```
 */
export function createBladeTrailMesh(scene: Scene, rig: TransformNode): BladeTrailMesh {
  const positions = new Float32Array(TRAIL_SAMPLES * 6)
  const colors = new Float32Array(TRAIL_SAMPLES * 8)
  const mesh = createRibbonMesh(scene, rig, positions, colors)
  const trail = createBladeTrail()
  const scratch = createTrailScratch()
  let color: readonly [number, number, number] = [1, 0.16, 0.24]
  return {
    setColor: (next) => {
      color = next
    },
    warmUp: () => mesh.setEnabled(true),
    update: (blade, anchors, strength) => {
      if (!blade || strength <= 0) {
        hideRibbon(mesh, trail)
        return
      }
      const nowS = performance.now() / 1000
      sampleBlade(trail, blade, rig, anchors, scratch, nowS)
      writeTrailRibbon(trail, strength, nowS, color, positions, colors)
      mesh.updateVerticesData(VertexBuffer.PositionKind, positions)
      mesh.updateVerticesData(VertexBuffer.ColorKind, colors)
      if (!mesh.isEnabled()) mesh.setEnabled(true)
    },
  }
}

function hideRibbon(mesh: Mesh, trail: BladeTrail): void {
  clearBladeTrail(trail)
  if (mesh.isEnabled()) mesh.setEnabled(false)
}

/** A malha da fita, com os buffers de posição e cor que o quadro reescreve. */
function createRibbonMesh(
  scene: Scene,
  rig: TransformNode,
  positions: Float32Array,
  colors: Float32Array,
): Mesh {
  const mesh = new Mesh('blade-trail', scene)
  const data = new VertexData()
  data.positions = positions
  data.colors = colors
  data.indices = trailIndices()
  data.applyToMesh(mesh, true)
  mesh.hasVertexAlpha = true
  mesh.material = additiveMaterial(scene, 'blade-trail', Color3.White())
  mesh.parent = rig
  mesh.isPickable = false
  // a caixa envolvente é a do primeiro quadro: a fita anda, e o recorte erraria.
  mesh.alwaysSelectAsActiveMesh = true
  maskAsViewmodel([mesh])
  mesh.setEnabled(false)
  return mesh
}

interface TrailScratch {
  readonly toRig: Matrix
  readonly local: Vector3
  readonly inner: Vector3
  readonly tip: Vector3
}

function createTrailScratch(): TrailScratch {
  return { toRig: new Matrix(), local: new Vector3(), inner: new Vector3(), tip: new Vector3() }
}

/** O meio e a ponta da lâmina, levados do espaço dela ao do rig, sem alocar. */
function sampleBlade(
  trail: BladeTrail,
  blade: AbstractMesh,
  rig: TransformNode,
  anchors: TrailAnchors,
  scratch: TrailScratch,
  nowS: number,
): void {
  rig.getWorldMatrix().invertToRef(scratch.toRig)
  blade.getWorldMatrix().multiplyToRef(scratch.toRig, scratch.toRig)
  scratch.local.set(anchors.innerM[0], anchors.innerM[1], anchors.innerM[2])
  Vector3.TransformCoordinatesToRef(scratch.local, scratch.toRig, scratch.inner)
  scratch.local.set(anchors.tipM[0], anchors.tipM[1], anchors.tipM[2])
  Vector3.TransformCoordinatesToRef(scratch.local, scratch.toRig, scratch.tip)
  pushTrailSample(trail, scratch.inner, scratch.tip, nowS)
}
