import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { Vector3 as CoreVector3 } from '@shobu/core'
import { createRibbonAxes, type RibbonAxes, ribbonAxes } from './ribbonAxes.ts'
import { aimRibbon, createRibbon } from './ribbonMeshes.ts'
import { glowMaterial } from './shotMaterials.ts'
import {
  advanceTracers,
  createTracerPool,
  fireTracer,
  moveTracerStart,
  type TracerPool,
  type TracerSlot,
  tracerCoreOpacity,
  tracerHeadProgress,
  tracerOpacity,
  tracerTicket,
  tracerWidthScale,
} from './tracerPool.ts'

/**
 * O feixe do laser no babylon. Sem teste: é adapter puro de engine, e
 * instanciar malha exige um contexto webgl que não existe no node (ADR 0001) —
 * a vida, as curvas e os eixos da fita moram em `tracerPool.ts` e
 * `ribbonAxes.ts`, que são testados.
 *
 * **Fitas que encaram o olho, e não cilindros.** O cilindro de seis lados
 * lia como tubo de plástico: de perto mostrava as faces, e de longe virava
 * um fio de um pixel sem degradê. A fita é um plano que gira em volta do
 * próprio eixo para ficar de frente, com o degradê na textura
 * (`tracer-profile.png`): núcleo quente e queda suave, de qualquer ângulo.
 *
 * **Três camadas, com tempos e larguras diferentes**:
 *
 * - **núcleo** fino e quase branco, que pisca: é o tiro.
 * - **halo** largo e vermelho, que fica um pouco mais e **afina** enquanto
 *   some: é o ar atrás dele.
 * - **cabeça**, um trecho curto e branco que corre do cano ao impacto no
 *   primeiro terço da vida: é o que faz o feixe viajar em vez de aparecer.
 *
 * O estouro no ponto de impacto mudou para `shotVisuals.ts`, com faísca na
 * parede e acerto no corpo distintos.
 */
export interface TracerBeams {
  /** Acende um feixe, uma vez por tiro, e devolve o bilhete dele (`tracerTicket`). */
  fire(fromM: Readonly<CoreVector3>, toM: Readonly<CoreVector3>): number
  /**
   * Leva o começo do feixe do bilhete `ticket` para `fromM` — o cano do
   * jogador depois do coice — e o redesenha na hora: chamado no quadro da
   * câmera, já com a pose final dela. Se o rodízio já deu o slot a outro
   * tiro, não faz nada (`moveTracerStart`).
   */
  anchor(ticket: number, fromM: Readonly<CoreVector3>): void
  /** Todo quadro: encolhe a vida, vira as fitas para o olho e apaga o que acabou. */
  advance(dtS: number): void
}

/** Os lados das fitas, em metros. O perfil da textura esfuma a borda: o visível é menos. */
const CORE_WIDTH_M = 0.03
const HALO_WIDTH_M = 0.11
const HEAD_WIDTH_M = 0.07

/** O comprimento da cabeça: um risco, não um segundo feixe. */
const HEAD_LENGTH_M = 7

/** Quase branco, puxando para o âmbar: é metal incandescente, não tinta. */
const CORE_COLOR = new Color3(1, 0.93, 0.8)

/** O vermelho da paleta do hud, que é a cor do jogo. */
const HALO_COLOR = new Color3(1, 0.22, 0.28)

const HEAD_COLOR = new Color3(1, 0.97, 0.9)

const PROFILE_TEXTURE = 'tracer-profile.png'

interface BeamRibbons {
  readonly core: Mesh
  readonly halo: Mesh
  readonly head: Mesh
}

/** Os rascunhos do adapter, para não alocar por disparo nem por quadro. */
interface BeamScratch {
  readonly axes: RibbonAxes
  readonly from: CoreVector3
  readonly to: CoreVector3
}

/**
 * ```ts
 * const beams = createTracerBeams(scene, 8, 0.25, () => scene.activeCamera?.globalPosition)
 * ```
 */
export function createTracerBeams(
  scene: Scene,
  poolSize: number,
  lifetimeS: number,
  eyeM: () => Readonly<CoreVector3> | undefined,
): TracerBeams {
  const pool = createTracerPool(poolSize, lifetimeS)
  const beams = createBeamRibbons(scene, pool.slots.length)
  const scratch: BeamScratch = {
    axes: createRibbonAxes(),
    from: { x: 0, y: 0, z: 0 },
    to: { x: 0, y: 0, z: 0 },
  }
  return {
    fire: (fromM, toM) => tracerTicket(pool, fireTracer(pool, fromM, toM)),
    anchor: (ticket, fromM) => {
      const index = moveTracerStart(pool, ticket, fromM)
      if (index >= 0) redrawBeam(pool, beams, scratch, index, eyeM())
    },
    advance: (dtS) => advanceBeamRibbons(pool, beams, scratch, dtS, eyeM()),
  }
}

function createBeamRibbons(scene: Scene, count: number): readonly BeamRibbons[] {
  const coreMaterial = glowMaterial(scene, 'tracer-core', PROFILE_TEXTURE, CORE_COLOR)
  const haloMaterial = glowMaterial(scene, 'tracer-halo', PROFILE_TEXTURE, HALO_COLOR)
  const headMaterial = glowMaterial(scene, 'tracer-head', PROFILE_TEXTURE, HEAD_COLOR)
  return Array.from({ length: count }, () => ({
    core: createRibbon(scene, 'tracer-core', coreMaterial, CORE_WIDTH_M),
    halo: createRibbon(scene, 'tracer-halo', haloMaterial, HALO_WIDTH_M),
    head: createRibbon(scene, 'tracer-head', headMaterial, HEAD_WIDTH_M),
  }))
}

function advanceBeamRibbons(
  pool: TracerPool,
  beams: readonly BeamRibbons[],
  scratch: BeamScratch,
  dtS: number,
  eyeM: Readonly<CoreVector3> | undefined,
): void {
  advanceTracers(pool, dtS)
  for (let index = 0; index < beams.length; index += 1) {
    const beam = beams[index] as BeamRibbons
    const slot = pool.slots[index] as TracerSlot
    if (slot.remainingS <= 0 || !eyeM) {
      hideBeam(beam)
      continue
    }
    drawBeam(beam, slot, pool.lifetimeS, scratch, eyeM)
  }
}

/** Redesenha um slot só, sem envelhecer nada: o `anchor` corrige o quadro corrente. */
function redrawBeam(
  pool: TracerPool,
  beams: readonly BeamRibbons[],
  scratch: BeamScratch,
  index: number,
  eyeM: Readonly<CoreVector3> | undefined,
): void {
  const beam = beams[index]
  const slot = pool.slots[index] as TracerSlot
  if (!beam || !eyeM || slot.remainingS <= 0) return
  drawBeam(beam, slot, pool.lifetimeS, scratch, eyeM)
}

function drawBeam(
  beam: BeamRibbons,
  slot: Readonly<TracerSlot>,
  lifetimeS: number,
  scratch: BeamScratch,
  eyeM: Readonly<CoreVector3>,
): void {
  const { from, to, axes } = scratch
  from.x = slot.startX
  from.y = slot.startY
  from.z = slot.startZ
  to.x = slot.endX
  to.y = slot.endY
  to.z = slot.endZ
  const lengthM = ribbonAxes(from, to, eyeM, axes)
  showRibbon(
    beam.halo,
    tracerOpacity(slot, lifetimeS),
    from,
    axes,
    lengthM,
    tracerWidthScale(slot, lifetimeS),
  )
  showRibbon(beam.core, tracerCoreOpacity(slot, lifetimeS), from, axes, lengthM, 1)
  drawHead(beam.head, tracerHeadProgress(slot, lifetimeS), scratch, lengthM)
}

/**
 * A cabeça vai de `progress × comprimento − HEAD_LENGTH_M` a
 * `progress × comprimento`, cortada no cano. Reaproveita `from` do rascunho
 * como o começo dela: o feixe já foi desenhado.
 */
function drawHead(head: Mesh, progress: number, scratch: BeamScratch, lengthM: number): void {
  if (progress < 0) {
    head.setEnabled(false)
    return
  }
  const { from, axes } = scratch
  const tipM = progress * lengthM
  const tailM = Math.max(0, tipM - HEAD_LENGTH_M)
  from.x += axes.along.x * tailM
  from.y += axes.along.y * tailM
  from.z += axes.along.z * tailM
  showRibbon(head, 1, from, axes, tipM - tailM, 1)
}

function showRibbon(
  ribbon: Mesh,
  opacity: number,
  fromM: Readonly<CoreVector3>,
  axes: Readonly<RibbonAxes>,
  lengthM: number,
  widthScale: number,
): void {
  if (opacity <= 0) {
    ribbon.setEnabled(false)
    return
  }
  aimRibbon(ribbon, fromM, axes, lengthM, widthScale)
  ribbon.visibility = opacity
}

function hideBeam(beam: BeamRibbons): void {
  if (beam.core.isEnabled(false)) beam.core.setEnabled(false)
  if (beam.halo.isEnabled(false)) beam.halo.setEnabled(false)
  if (beam.head.isEnabled(false)) beam.head.setEnabled(false)
}
