import type { LensRenderLoop } from './firstPersonLens.ts'
import type { ViewmodelPlacement } from './loadSniperViewmodel.ts'
import type { ViewBob } from './viewBob.ts'
import {
  advanceViewmodelSway,
  type ViewmodelSway,
  type ViewmodelSwayOffset,
  type ViewmodelSwaySample,
  viewmodelSwayOffset,
  wrapAngleRad,
} from './viewmodelSway.ts'

/** De onde vem o giro da mira: a rotação da câmera do mundo. */
export interface AimSource {
  readonly rotation: { readonly x: number; readonly y: number }
}

/**
 * O que a arma lê do corpo do jogador, e que a passada não dá: a passada vem do
 * `ViewBob`, e ele zera no ar e no slide.
 */
export interface BodyMotion {
  /** Velocidade vertical, em m/s. Positiva subindo. */
  readonly verticalSpeedMps: number
  readonly sliding: boolean
}

/** O que o balanço escreve no rig. Estrutural para o teste não precisar do babylon. */
export interface SwayRig {
  readonly position: { set(x: number, y: number, z: number): void }
  readonly rotation: { set(x: number, y: number, z: number): void }
}

export interface ViewmodelRigOptions {
  readonly rig: SwayRig
  readonly aim: AimSource
  /** Lido por quadro: o estado do corpo muda em tick fixo, não na criação. */
  readonly body: () => BodyMotion
  readonly placement: ViewmodelPlacement
  readonly sway: ViewmodelSway
  /** O **mesmo** balanço que a câmera usa: quem avança a fase é o driver da câmera. */
  readonly bob: ViewBob
  readonly frameDeltaMs: () => number
}

/**
 * Põe o balanço procedural no rig da arma a cada quadro.
 *
 * O `ViewBob` chega já avançado por `driveCameraFromCharacter`: avançá-lo aqui
 * de novo dobraria a velocidade da passada e tiraria a arma de fase com a
 * câmera, que é exatamente o defeito que compartilhar a fase evita.
 *
 * ```ts
 * driveViewmodelRig(scene, { rig, aim: camera, body, placement, sway, bob, frameDeltaMs })
 * ```
 */
export function driveViewmodelRig(scene: LensRenderLoop, options: ViewmodelRigOptions): void {
  const { rig, aim, placement, sway, bob } = options
  const offset: ViewmodelSwayOffset = { right: 0, up: 0, yawRad: 0, pitchRad: 0, rollRad: 0 }
  const sample: MutableSwaySample = {
    yawDeltaRad: 0,
    pitchDeltaRad: 0,
    stridePhase: 0,
    strideAmplitude: 0,
    verticalSpeedMps: 0,
    sliding: false,
  }
  let previousYaw = aim.rotation.y
  let previousPitch = aim.rotation.x
  scene.onBeforeRenderObservable.add(() => {
    sample.yawDeltaRad = wrapAngleRad(aim.rotation.y - previousYaw)
    sample.pitchDeltaRad = wrapAngleRad(aim.rotation.x - previousPitch)
    previousYaw = aim.rotation.y
    previousPitch = aim.rotation.x
    sample.stridePhase = bob.phase
    sample.strideAmplitude = bob.amplitude
    const body = options.body()
    sample.verticalSpeedMps = body.verticalSpeedMps
    sample.sliding = body.sliding
    advanceViewmodelSway(sway, sample, options.frameDeltaMs() / 1000)
    viewmodelSwayOffset(sway, sample, offset)
    rig.position.set(
      placement.offsetM[0] + offset.right,
      placement.offsetM[1] + offset.up,
      placement.offsetM[2],
    )
    rig.rotation.set(
      placement.pitchRad + offset.pitchRad,
      placement.yawRad + offset.yawRad,
      offset.rollRad,
    )
  })
}

type MutableSwaySample = { -readonly [K in keyof ViewmodelSwaySample]: ViewmodelSwaySample[K] }
