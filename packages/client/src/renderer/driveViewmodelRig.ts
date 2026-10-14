import type { LensRenderLoop } from './firstPersonLens.ts'
import {
  cameraTurnQuaternion,
  createRigTransform,
  multiplyQuaternions,
  poseAboutGrip,
  type RigTransform,
  type RigVector,
  yawPitchRollQuaternion,
} from './gripPivot.ts'
import type { ViewmodelPlacement } from './loadSniperViewmodel.ts'
import { createRigPose, type RigPose } from './rigPose.ts'
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

/**
 * O que o balanço escreve no rig. Estrutural para o teste não precisar do
 * babylon. O giro vai em quaternion: a pose compõe por cima do ajuste
 * (`poseAboutGrip`), e ângulos de Euler somados não são um giro composto.
 */
export interface SwayRig {
  readonly position: { set(x: number, y: number, z: number): void }
  readonly rotationQuaternion: { set(x: number, y: number, z: number, w: number): void }
}

export interface ViewmodelRigOptions {
  readonly rig: SwayRig
  readonly aim: AimSource
  /** Lido por quadro: o estado do corpo muda em tick fixo, não na criação. */
  readonly body: () => BodyMotion
  /** Lido por quadro: o óculos troca a posição da arma ao entrar e ao sair. */
  readonly placement: () => ViewmodelPlacement
  readonly sway: ViewmodelSway
  /**
   * O coice, **já avançado neste quadro** por `driveArenaWeapon`: ele registra
   * o passo de quadro antes deste, então aqui o valor é o de agora.
   */
  readonly recoil: Readonly<WeaponRecoil>
  /** O **mesmo** balanço que a câmera usa: quem avança a fase é o driver da câmera. */
  readonly bob: ViewBob
  /**
   * A pose por cima do descanso, lida por quadro: a corrida e o golpe
   * (`viewmodelStage.ts`). Quem a escreve registra o passo dele antes deste.
   */
  readonly pose: () => Readonly<RigPose>
  /** Onde a mão segura a arma, no espaço do glb: o pivô da pose (`gripPivot.ts`). */
  readonly gripM: Readonly<RigVector>
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
 * driveViewmodelRig(scene, { rig, aim: camera, body, placement, sway, bob, recoil, pose, gripM, frameDeltaMs })
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
  const frame: RigFrame = { transform: createRigTransform(), rest: createRigPose() }
  scene.onBeforeRenderObservable.add(() => {
    sampleRigFrame(options, previous, sample)
    advanceViewmodelSway(options.sway, sample, options.frameDeltaMs() / 1000)
    viewmodelSwayOffset(options.sway, sample, offset)
    placeRig(options, offset, frame)
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

/** O rascunho do quadro, reaproveitado: o ajuste como pose, e o giro que sai dele. */
interface RigFrame {
  readonly transform: RigTransform
  readonly rest: RigPose
}

const swayTurn = { x: 0, y: 0, z: 0, w: 1 }

/**
 * O ajuste, o balanço e o coice; depois a pose da corrida e do golpe, girando
 * em volta da mão. O balanço e o coice são giros pequenos, e compõem por cima
 * do ajuste nos eixos da câmera.
 */
function placeRig(
  options: ViewmodelRigOptions,
  offset: Readonly<ViewmodelSwayOffset>,
  frame: RigFrame,
): void {
  const { rig, recoil } = options
  const placement = options.placement()
  const { position, rotation } = frame.transform
  position.x = placement.offsetM[0] + offset.right
  position.y = placement.offsetM[1] + offset.up + weaponPunchUpM(recoil)
  // o cano aponta para +z, então recuar é subtrair.
  position.z = placement.offsetM[2] - weaponPunchBackM(recoil)
  cameraTurnQuaternion(restPose(placement, frame.rest), rotation)
  yawPitchRollQuaternion(
    offset.yawRad,
    offset.pitchRad + weaponPunchPitchRad(recoil),
    offset.rollRad,
    swayTurn,
  )
  multiplyQuaternions(swayTurn, rotation, rotation)
  poseAboutGrip(frame.transform, options.pose(), options.gripM)
  rig.position.set(position.x, position.y, position.z)
  rig.rotationQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
}

/** O giro do ajuste escrito como pose, para passar pela mesma conta da corrida. */
function restPose(placement: ViewmodelPlacement, out: RigPose): RigPose {
  out.pitchRad = placement.pitchRad
  out.yawRad = placement.yawRad
  out.rollRad = placement.rollRad ?? 0
  out.cantRad = placement.cantRad ?? 0
  return out
}

type MutableSwaySample = { -readonly [K in keyof ViewmodelSwaySample]: ViewmodelSwaySample[K] }
