import type { LensRenderLoop } from './firstPersonLens.ts'
import type { ViewmodelPlacement } from './loadSniperViewmodel.ts'
import type { ViewBob } from './viewBob.ts'
import {
  advanceViewmodelSway,
  type ViewmodelSway,
  type ViewmodelSwayOffset,
  type ViewmodelSwaySample,
  viewmodelSwayOffset,
} from './viewmodelSway.ts'

/** O que o balanço escreve no rig. Estrutural para o teste não precisar do babylon. */
export interface SwayRig {
  readonly position: { set(x: number, y: number, z: number): void }
  readonly rotation: { set(x: number, y: number, z: number): void }
}

export interface ViewmodelRigOptions {
  readonly rig: SwayRig
  readonly placement: ViewmodelPlacement
  readonly sway: ViewmodelSway
  /** O **mesmo** balanço que a câmera usa: quem avança a fase é o driver da câmera. */
  readonly bob: ViewBob
  readonly frameDeltaMs: () => number
}

/**
 * Põe o balanço procedural no rig da arma a cada quadro.
 *
 * **Não recebe a câmera.** A arma é filha dela e acompanha o giro rigidamente,
 * e nada aqui dentro lê a mira: girar não pode mexer na arma, e a garantia é
 * estrutural, não um número bem ajustado (ver `viewmodelSway.ts`).
 *
 * O `ViewBob` chega já avançado por `driveCameraFromCharacter`: avançá-lo aqui
 * de novo dobraria a velocidade da passada e tiraria a arma de fase com a
 * câmera, que é exatamente o defeito que compartilhar a fase evita.
 *
 * ```ts
 * driveViewmodelRig(scene, { rig, placement, sway, bob, frameDeltaMs })
 * ```
 */
export function driveViewmodelRig(scene: LensRenderLoop, options: ViewmodelRigOptions): void {
  const { rig, placement, sway, bob } = options
  const offset: ViewmodelSwayOffset = { right: 0, up: 0, rollRad: 0 }
  const sample: MutableSwaySample = { stridePhase: 0, strideAmplitude: 0 }
  scene.onBeforeRenderObservable.add(() => {
    sample.stridePhase = bob.phase
    sample.strideAmplitude = bob.amplitude
    advanceViewmodelSway(sway, sample, options.frameDeltaMs() / 1000)
    viewmodelSwayOffset(sway, sample, offset)
    rig.position.set(
      placement.offsetM[0] + offset.right,
      placement.offsetM[1] + offset.up,
      placement.offsetM[2],
    )
    rig.rotation.set(placement.pitchRad, placement.yawRad, offset.rollRad)
  })
}

type MutableSwaySample = { -readonly [K in keyof ViewmodelSwaySample]: ViewmodelSwaySample[K] }
