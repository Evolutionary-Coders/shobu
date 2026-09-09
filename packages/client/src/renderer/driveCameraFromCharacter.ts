import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Axis } from '@babylonjs/core/Maths/math.axis'
import { Vector3 as BabylonVector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import { horizontalSpeed, type Vector3 } from '@shobu/core'
import type { HeldKeys } from '../controller/heldKeys.ts'
import type { LocalCharacter } from '../controller/localCharacter.ts'
import {
  createMovementInput,
  type PlanarBasis,
  planarUnit,
  wishFromKeys,
} from '../controller/wishDirection.ts'
import { advanceViewBob, type ViewBob, type ViewBobOffset, viewBobOffset } from './viewBob.ts'

export interface CameraDriverOptions {
  readonly camera: UniversalCamera
  readonly character: LocalCharacter
  readonly keys: HeldKeys
  /** Tempo do último quadro, em milissegundos — o `engine.getDeltaTime()` do babylon. */
  readonly frameDeltaMs: () => number
  /** O balanço de câmera, já criado com a preferência de movimento do jogador. */
  readonly viewBob: ViewBob
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
  const { camera, character, keys, viewBob } = options
  const input = createMovementInput()
  const eye: Vector3 = { x: 0, y: 0, z: 0 }
  const bob: ViewBobOffset = { up: 0, right: 0 }
  scene.onBeforeRenderObservable.add(() => {
    const basis = planarBasisOf(camera)
    const frameS = options.frameDeltaMs() / 1000
    wishFromKeys(keys, basis, input)
    character.advance(frameS, input)
    character.eyePosition(eye)
    swayEye(eye, basis, options, frameS, bob)
    camera.position.set(eye.x, eye.y, eye.z)
  })
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
