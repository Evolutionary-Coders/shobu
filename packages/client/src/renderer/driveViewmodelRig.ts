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
import {
  type WeaponRecoil,
  weaponPunchBackM,
  weaponPunchPitchRad,
  weaponPunchUpM,
} from './weaponRecoil.ts'

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
  /**
   * O coice, **já avançado neste quadro** por `driveArenaWeapon`: ele registra
   * o passo de quadro antes deste, então aqui o valor é o de agora.
   */
  readonly recoil: Readonly<WeaponRecoil>
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
 * driveViewmodelRig(scene, { rig, aim: camera, body, placement, sway, bob, recoil, frameDeltaMs })
 * ```
 */
export function driveViewmodelRig(scene: LensRenderLoop, options: ViewmodelRigOptions): void {
  const offset: ViewmodelSwayOffset = { right: 0, up: 0, yawRad: 0, pitchRad: 0, rollRad: 0 }
  const sample: MutableSwaySample = {
    yawDeltaRad: 0,
    pitchDeltaRad: 0,
    stridePhase: 0,
    strideAmplitude: 0,
    verticalSpeedMps: 0,
    sliding: false,
  }
  const previous: AimAngles = { yawRad: options.aim.rotation.y, pitchRad: options.aim.rotation.x }
  scene.onBeforeRenderObservable.add(() => {
    sampleRigFrame(options, previous, sample)
    advanceViewmodelSway(options.sway, sample, options.frameDeltaMs() / 1000)
    viewmodelSwayOffset(options.sway, sample, offset)
    placeRig(options, offset)
  })
}

/** O giro do quadro anterior: o atraso da arma é a **diferença**, não o ângulo. */
interface AimAngles {
  yawRad: number
  pitchRad: number
}

function sampleRigFrame(
  options: ViewmodelRigOptions,
  previous: AimAngles,
  into: MutableSwaySample,
): void {
  const { aim, bob } = options
  into.yawDeltaRad = wrapAngleRad(aim.rotation.y - previous.yawRad)
  into.pitchDeltaRad = wrapAngleRad(aim.rotation.x - previous.pitchRad)
  previous.yawRad = aim.rotation.y
  previous.pitchRad = aim.rotation.x
  into.stridePhase = bob.phase
  into.strideAmplitude = bob.amplitude
  const body = options.body()
  into.verticalSpeedMps = body.verticalSpeedMps
  into.sliding = body.sliding
}

function placeRig(options: ViewmodelRigOptions, offset: Readonly<ViewmodelSwayOffset>): void {
  const { rig, placement, recoil } = options
  rig.position.set(
    placement.offsetM[0] + offset.right,
    placement.offsetM[1] + offset.up + weaponPunchUpM(recoil),
    // o cano aponta para +z, então recuar é subtrair.
    placement.offsetM[2] - weaponPunchBackM(recoil),
  )
  rig.rotation.set(
    placement.pitchRad + offset.pitchRad + weaponPunchPitchRad(recoil),
    placement.yawRad + offset.yawRad,
    offset.rollRad,
  )
}

type MutableSwaySample = { -readonly [K in keyof ViewmodelSwaySample]: ViewmodelSwaySample[K] }
