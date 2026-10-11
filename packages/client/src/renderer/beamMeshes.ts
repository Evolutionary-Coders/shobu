import '@babylonjs/core/Shaders/default.vertex'
import '@babylonjs/core/Shaders/default.fragment'
import { Constants } from '@babylonjs/core/Engines/constants'
import { Material } from '@babylonjs/core/Materials/material'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, type Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'

/**
 * As peças de luz desenhadas por soma aditiva: o feixe do tiro e o cabo do
 * gancho. Sem teste: é adapter puro de engine (ADR 0001).
 *
 * **Sem `GlowLayer`**: ele aloca dois render targets de meia resolução e dois
 * passes de blur todo quadro, brilhando ou não. Soma aditiva de malhas sem
 * iluminação dá o mesmo brilho por custo zero fixo.
 */

/** Seis lados bastam: o núcleo é um fio e o halo é translúcido. */
const BEAM_SIDES = 6

/**
 * Um cilindro de z = 0 a z = 1, com a transformação assada na malha: assim
 * `lookAt` alinha o feixe e `scaling.z` vira o comprimento em metros, sem
 * matemática por quadro.
 *
 * ```ts
 * const core = createBeam(scene, 'tracer', material, 0.008)
 * ```
 */
export function createBeam(
  scene: Scene,
  name: string,
  material: StandardMaterial,
  diameterM: number,
): Mesh {
  const beam = CreateCylinder(
    name,
    { height: 1, diameterTop: diameterM, diameterBottom: diameterM, tessellation: BEAM_SIDES },
    scene,
  )
  beam.bakeTransformIntoVertices(
    Matrix.RotationX(Math.PI / 2).multiply(Matrix.Translation(0, 0, 0.5)),
  )
  return dressBeam(beam, material)
}

/**
 * Um plano que **sempre encara a câmera**: no ponto de impacto não há direção
 * certa para uma faísca ficar virada, e um plano de lado some.
 *
 * ```ts
 * const flash = createFlash(scene, 'tracer-flash', material, 0.45)
 * ```
 */
export function createFlash(
  scene: Scene,
  name: string,
  material: StandardMaterial,
  sizeM: number,
): Mesh {
  const flash = CreatePlane(name, { size: sizeM }, scene)
  flash.billboardMode = 7
  return dressBeam(flash, material)
}

/**
 * Um losango que encara a câmera: o disco de quatro lados. É a marca de um
 * ponto cravado — o quadrado do `createFlash` lido de longe parece pixel
 * perdido, e o losango, mira.
 *
 * ```ts
 * const marker = createDiamond(scene, 'grapple-anchor', material, 0.2)
 * ```
 */
export function createDiamond(
  scene: Scene,
  name: string,
  material: StandardMaterial,
  sizeM: number,
): Mesh {
  const diamond = CreateDisc(name, { radius: sizeM / 2, tessellation: 4 }, scene)
  diamond.billboardMode = 7
  return dressBeam(diamond, material)
}

/**
 * Estica o cilindro de `createBeam` de `from` a `to`. Os vetores são do
 * chamador, reaproveitados: nada aloca por disparo nem por quadro.
 *
 * ```ts
 * aimBeam(core, from, to, Vector3.Distance(from, to))
 * ```
 */
export function aimBeam(beam: Mesh, from: Vector3, to: Vector3, lengthM: number): void {
  beam.position.copyFrom(from)
  beam.lookAt(to)
  beam.scaling.z = lengthM
  beam.setEnabled(true)
}

function dressBeam(mesh: Mesh, material: StandardMaterial): Mesh {
  mesh.material = material
  mesh.isPickable = false
  mesh.doNotSyncBoundingInfo = true
  mesh.setEnabled(false)
  return mesh
}

/**
 * Um material por camada, compartilhado por todas as malhas dela: o
 * esmaecimento é por malha, em `visibility`, e não por clone de material.
 *
 * ```ts
 * const halo = additiveMaterial(scene, 'tracer-halo', new Color3(1, 0.26, 0.3))
 * ```
 */
export function additiveMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  material.disableLighting = true
  material.emissiveColor = color
  material.diffuseColor = Color3.Black()
  material.specularColor = Color3.Black()
  material.alphaMode = Constants.ALPHA_ADD
  // a passada transparente, sempre. Sem isto, malha com `visibility` 1 caía na
  // opaca, onde a falta de escrita de depth deixava a parede desenhada depois
  // apagar o feixe: o cabo do gancho não aparecia nunca, e o tiro sumia no
  // quadro em que acende (medido no headless, 11/10).
  material.transparencyMode = Material.MATERIAL_ALPHABLEND
  material.backFaceCulling = false
  // soma aditiva não tem o que escrever no depth: o feixe é luz, e luz não
  // esconde o que está atrás dela.
  material.disableDepthWrite = true
  material.freeze()
  return material
}
