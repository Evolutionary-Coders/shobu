import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { Vector3 as CoreVector3 } from '@shobu/core'
import { additiveMaterial, aimBeam, createBeam, createFlash } from './beamMeshes.ts'
import {
  advanceTracers,
  createTracerPool,
  fireTracer,
  type TracerPool,
  tracerCoreOpacity,
  tracerFlashOpacity,
  tracerOpacity,
} from './tracerPool.ts'

/**
 * O feixe do laser no babylon. Sem teste: é adapter puro de engine, e
 * instanciar malha exige um contexto webgl que não existe no node (ADR 0001) —
 * a vida, o comprimento e as três curvas de opacidade moram em
 * `tracerPool.ts`, que é testado.
 *
 * **Três camadas, com tempos e larguras diferentes**, porque é isso que separa
 * um feixe de um cilindro pintado:
 *
 * - **núcleo** fino e quase branco, que pisca: é o tiro.
 * - **halo** largo e vermelho, que fica um pouco mais: é o ar atrás dele.
 * - **estouro** no ponto de impacto, o mais curto dos três: é o que dá a
 *   sensação de a bala ter chegado em algum lugar, em vez de o traço acabar no
 *   nada.
 *
 * As malhas e o material aditivo moram em `beamMeshes.ts`, divididos com o
 * cabo do gancho.
 */
export interface TracerBeams {
  /** Acende um feixe. Uma vez por tiro. */
  fire(fromM: Readonly<CoreVector3>, toM: Readonly<CoreVector3>): void
  /** Todo quadro: encolhe a vida e apaga o que acabou. */
  advance(dtS: number): void
}

/** O núcleo é um fio: 8 mm. O halo é o dobro e meio, e some antes de virar tubo. */
const CORE_DIAMETER_M = 0.008
const HALO_DIAMETER_M = 0.05

/** O estouro do impacto, em metros. Pequeno: é faísca, não explosão. */
const FLASH_SIZE_M = 0.45

/** Quase branco, puxando para o âmbar: é metal incandescente, não tinta. */
const CORE_COLOR = new Color3(1, 0.93, 0.78)

/** O vermelho da paleta do hud, que é a cor do jogo. */
const HALO_COLOR = new Color3(1, 0.26, 0.3)

const FLASH_COLOR = new Color3(1, 0.78, 0.45)

interface BeamTrio {
  readonly core: Mesh
  readonly halo: Mesh
  readonly flash: Mesh
}

export function createTracerBeams(scene: Scene, poolSize: number, lifetimeS: number): TracerBeams {
  const pool = createTracerPool(poolSize, lifetimeS)
  const beams = createBeamTrios(scene, pool.slots.length)
  // reaproveitados entre tiros: `fire` roda por disparo e não deve alocar.
  const from = new Vector3()
  const to = new Vector3()
  return {
    fire: (fromM, toM) => fireBeamTrio(pool, beams, { from, to }, fromM, toM),
    advance: (dtS) => advanceBeamTrios(pool, beams, dtS),
  }
}

function createBeamTrios(scene: Scene, count: number): readonly BeamTrio[] {
  const coreMaterial = additiveMaterial(scene, 'tracer-core', CORE_COLOR)
  const haloMaterial = additiveMaterial(scene, 'tracer-halo', HALO_COLOR)
  const flashMaterial = additiveMaterial(scene, 'tracer-flash', FLASH_COLOR)
  return Array.from({ length: count }, () => ({
    core: createBeam(scene, 'tracer', coreMaterial, CORE_DIAMETER_M),
    halo: createBeam(scene, 'tracer', haloMaterial, HALO_DIAMETER_M),
    flash: createFlash(scene, 'tracer-flash', flashMaterial, FLASH_SIZE_M),
  }))
}

/** Os dois vetores de rascunho do adapter, para não alocar por disparo. */
interface BeamScratch {
  readonly from: Vector3
  readonly to: Vector3
}

function fireBeamTrio(
  pool: TracerPool,
  beams: readonly BeamTrio[],
  scratch: BeamScratch,
  fromM: Readonly<CoreVector3>,
  toM: Readonly<CoreVector3>,
): void {
  const beam = beams[fireTracer(pool, fromM, toM)]
  if (!beam) return
  const { from, to } = scratch
  from.set(fromM.x, fromM.y, fromM.z)
  to.set(toM.x, toM.y, toM.z)
  const lengthM = Vector3.Distance(from, to)
  aimBeam(beam.core, from, to, lengthM)
  aimBeam(beam.halo, from, to, lengthM)
  beam.flash.position.copyFrom(to)
  beam.flash.setEnabled(true)
}

function advanceBeamTrios(pool: TracerPool, beams: readonly BeamTrio[], dtS: number): void {
  advanceTracers(pool, dtS)
  for (let index = 0; index < beams.length; index += 1) {
    const beam = beams[index]
    const slot = pool.slots[index]
    if (!beam || !slot) continue
    fade(beam.core, tracerCoreOpacity(slot, pool.lifetimeS))
    fade(beam.halo, tracerOpacity(slot, pool.lifetimeS))
    fade(beam.flash, tracerFlashOpacity(slot, pool.lifetimeS))
  }
}

function fade(mesh: Mesh, opacity: number): void {
  if (opacity <= 0) {
    mesh.setEnabled(false)
    return
  }
  mesh.visibility = opacity
}
