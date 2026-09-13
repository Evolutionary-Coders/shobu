import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Axis } from '@babylonjs/core/Maths/math.axis'
import { Vector3 as BabylonVector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import { horizontalSpeed, type Vector3 } from '@shobu/core'
import type { ArenaFrame } from '../controller/arenaSession.ts'
import type { HeldKeys } from '../controller/heldKeys.ts'
import type { LocalCharacter } from '../controller/localCharacter.ts'
import {
  type MutableMovementInput,
  type PlanarBasis,
  planarUnit,
  wishFromKeys,
} from '../controller/wishDirection.ts'
import { advanceViewBob, type ViewBob, type ViewBobOffset, viewBobOffset } from './viewBob.ts'

/**
 * A `UniversalCamera` não tem trava de inclinação: sem isto o jogador passa da
 * vertical, o mundo gira de cabeça para baixo e a mira inverte. O centésimo de
 * radiano de folga é o que impede a frente da câmera degenerar exatamente no
 * eixo vertical, onde a base do chão não existe.
 */
const MAX_PITCH_RAD = Math.PI / 2 - 0.01

/** Impede a mira passar da vertical. Devolve a inclinação que a câmera deve ter. */
export function clampPitchRad(pitchRad: number): number {
  return Math.max(-MAX_PITCH_RAD, Math.min(MAX_PITCH_RAD, pitchRad))
}

export interface CameraDriverOptions {
  readonly camera: UniversalCamera
  readonly character: LocalCharacter
  /**
   * Quem avança a simulação do quadro. É a sessão da arena, que roda arma,
   * corpo, bonecos e placar no mesmo acumulador — este módulo só entrega o
   * olho e a mira e recebe a câmera de volta.
   */
  readonly advance: (frame: Readonly<ArenaFrame>) => number
  readonly keys: HeldKeys
  /** Tempo do último quadro, em milissegundos — o `engine.getDeltaTime()` do babylon. */
  readonly frameDeltaMs: () => number
  /** O balanço de câmera, já criado com a preferência de movimento do jogador. */
  readonly viewBob: ViewBob
  /** A entrada de movimentação que o cliente reaproveita por quadro. */
  readonly movementInput: MutableMovementInput
  readonly runSpeedMps: number
}

/**
 * A ponte por quadro entre o babylon e o núcleo: lê a frente da câmera e o
 * teclado, avança a simulação pelo tempo do quadro, e põe a câmera no olho
 * interpolado. Roda dentro do laço de render, então não disputa o quadro com
 * ele (nfr.md).
 *
 * `getDirection` e não `rotation.y` com seno e cosseno à mão: a matriz da
 * câmera já existe, e uma projeção no plano do chão é o que basta.
 *
 * ```ts
 * driveCameraFromCharacter(scene, { camera, character, keys, frameDeltaMs: () => engine.getDeltaTime() })
 * ```
 */
export function driveCameraFromCharacter(scene: Scene, options: CameraDriverOptions): void {
  const { camera, character, keys } = options
  const input = options.movementInput
  const eye: Vector3 = { x: 0, y: 0, z: 0 }
  const bob: ViewBobOffset = { up: 0, right: 0 }
  const frame = { elapsedS: 0, eyeM: eye, aimM: { x: 0, y: 0, z: 1 } }
  scene.onBeforeRenderObservable.add(() => {
    camera.rotation.x = clampPitchRad(camera.rotation.x)
    const basis = planarBasisOf(camera)
    const frameS = options.frameDeltaMs() / 1000
    wishFromKeys(keys, basis, input)
    // o olho do quadro anterior e a frente da câmera de agora: é de onde o tiro
    // sai, **sem balanço**, porque é o olho que o servidor rebobina.
    character.eyePosition(eye)
    frame.elapsedS = frameS
    frame.aimM = aimOf(camera)
    options.advance(frame)
    character.eyePosition(eye)
    swayEye(eye, basis, options, frameS, bob)
    camera.position.set(eye.x, eye.y, eye.z)
  })
}

/** A frente da câmera, em mundo. Reaproveitada: um vetor por quadro, não por chamada. */
function aimOf(camera: UniversalCamera): Vector3 {
  camera.getDirectionToRef(Axis.Z, forward)
  return forward
}

/**
 * O balanço entra **depois** do olho interpolado e só na câmera: a posição do
 * jogador que a simulação conhece não muda. `right` anda na direita da câmera
 * projetada no chão, então o balanço lateral acompanha para onde se olha.
 */
function swayEye(
  eye: Vector3,
  basis: PlanarBasis,
  options: CameraDriverOptions,
  frameS: number,
  bob: ViewBobOffset,
): void {
  const state = options.character.current
  advanceViewBob(
    options.viewBob,
    {
      grounded: state.grounded,
      stance: state.stance,
      horizontalSpeedMps: horizontalSpeed(state),
      runSpeedMps: options.runSpeedMps,
    },
    frameS,
  )
  viewBobOffset(options.viewBob, bob)
  eye.y += bob.up
  eye.x += basis.rightX * bob.right
  eye.z += basis.rightZ * bob.right
}

// dois vetores reaproveitados por quadro: `getDirection` alocaria dois
// objetos por quadro, e alocação por quadro é o que o nfr.md manda evitar.
const forward = new BabylonVector3()
const right = new BabylonVector3()

function planarBasisOf(camera: UniversalCamera): PlanarBasis {
  camera.getDirectionToRef(Axis.Z, forward)
  camera.getDirectionToRef(Axis.X, right)
  const [forwardX, forwardZ] = planarUnit(forward.x, forward.y, forward.z)
  const [rightX, rightZ] = planarUnit(right.x, right.y, right.z)
  return { forwardX, forwardZ, rightX, rightZ }
}
