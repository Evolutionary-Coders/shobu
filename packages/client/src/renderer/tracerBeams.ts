import '@babylonjs/core/Shaders/default.vertex'
import '@babylonjs/core/Shaders/default.fragment'
import { Constants } from '@babylonjs/core/Engines/constants'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { Vector3 as CoreVector3 } from '@shobu/core'
import {
  advanceTracers,
  createTracerPool,
  fireTracer,
  type TracerPool,
  tracerOpacity,
} from './tracerPool.ts'

/**
 * O feixe do laser no babylon. Sem teste: é adapter puro de engine, e
 * instanciar malha exige um contexto webgl que não existe no node (ADR 0001) —
 * a lógica de vida e de comprimento mora em `tracerPool.ts`, que é testado.
 *
 * **Sem `GlowLayer`**: ele aloca dois render targets de meia resolução e dois
 * passes de blur **todo quadro**, brilhando ou não, contra uma nfr que nomeia
 * draw call e coletor de lixo como as duas coisas a vigiar. Um material sem
 * iluminação, emissivo e em soma aditiva lê como laser por custo zero fixo.
 */
export interface TracerBeams {
  /** Acende um feixe. Uma vez por tiro. */
  fire(fromM: Readonly<CoreVector3>, toM: Readonly<CoreVector3>): void
  /** Todo quadro: encolhe a vida e apaga o que acabou. */
  advance(dtS: number): void
}

/** Fino: é um traço de luz, não um cano. */
const BEAM_DIAMETER_M = 0.02

/** Seis lados bastam para um cilindro de 2 cm visto de passagem. */
const BEAM_SIDES = 6

/** O âmbar da paleta do hud: o rastro é do jogo, e o jogo é vermelho e âmbar. */
const BEAM_COLOR = new Color3(1, 0.69, 0.13)

export function createTracerBeams(scene: Scene, poolSize: number, lifetimeS: number): TracerBeams {
  const pool = createTracerPool(poolSize, lifetimeS)
  const material = createBeamMaterial(scene)
  const beams = pool.slots.map(() => createBeam(scene, material))
  const from = new Vector3()
  const to = new Vector3()
  return {
    fire: (fromM, toM) => {
      const index = fireTracer(pool, fromM, toM)
      const beam = beams[index]
      if (!beam) return
      from.set(fromM.x, fromM.y, fromM.z)
      to.set(toM.x, toM.y, toM.z)
      beam.position.copyFrom(from)
      beam.lookAt(to)
      beam.scaling.z = Vector3.Distance(from, to)
      beam.setEnabled(true)
    },
    advance: (dtS) => {
      advanceTracers(pool, dtS)
      for (let index = 0; index < beams.length; index += 1) {
        const beam = beams[index]
        const slot = pool.slots[index]
        if (!beam || !slot) continue
        const opacity = tracerOpacity(slot, pool.lifetimeS)
        if (opacity <= 0) beam.setEnabled(false)
        else beam.visibility = opacity
      }
    },
  }
}

/**
 * Um cilindro de z = 0 a z = 1, com a transformação assada na malha: assim
 * `lookAt` alinha o feixe e `scaling.z` vira o comprimento em metros, sem
 * matemática por quadro.
 */
function createBeam(scene: Scene, material: StandardMaterial): Mesh {
  const beam = CreateCylinder(
    'tracer',
    {
      height: 1,
      diameterTop: BEAM_DIAMETER_M,
      diameterBottom: BEAM_DIAMETER_M,
      tessellation: BEAM_SIDES,
    },
    scene,
  )
  beam.bakeTransformIntoVertices(
    Matrix.RotationX(Math.PI / 2).multiply(Matrix.Translation(0, 0, 0.5)),
  )
  beam.material = material
  beam.isPickable = false
  beam.setEnabled(false)
  return beam
}

/** Um material só para todos os feixes: o fade é por malha, em `visibility`. */
function createBeamMaterial(scene: Scene): StandardMaterial {
  const material = new StandardMaterial('tracer', scene)
  material.disableLighting = true
  material.emissiveColor = BEAM_COLOR
  material.diffuseColor = Color3.Black()
  material.specularColor = Color3.Black()
  material.alphaMode = Constants.ALPHA_ADD
  material.backFaceCulling = false
  material.freeze()
  return material
}
