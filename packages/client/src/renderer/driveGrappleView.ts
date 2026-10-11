import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Axis } from '@babylonjs/core/Maths/math.axis'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { CharacterState, GameplayConfig } from '@shobu/core'
import { additiveMaterial, aimBeam, createBeam, createFlash } from './beamMeshes.ts'
import {
  advanceGrappleCameraKick,
  createGrappleCameraKick,
  type GrappleCameraKick,
  type GrappleCameraSample,
} from './grappleCameraKick.ts'
import {
  advanceGrappleRope,
  createGrappleRope,
  type GrappleRope,
  isAnchorMarked,
  isRopeVisible,
  ropeTipM,
} from './grappleRope.ts'

export interface GrappleViewOptions {
  readonly camera: UniversalCamera
  /** O estado do último tick: é dele que sai "preso", a âncora e a velocidade. */
  readonly character: () => Readonly<CharacterState>
  readonly config: GameplayConfig
  /**
   * Falso para quem pediu menos movimento: o puxão abre o fov e o balanço
   * inclina a câmera, o mesmo gatilho vestibular do balanço de câmera.
   */
  readonly motionAllowed: boolean
  /** O óculos manda na rotação da câmera inteira; a rolagem não entra nele. */
  readonly headsetActive: () => boolean
  readonly frameDeltaMs: () => number
}

/**
 * O fio é fino como o do tiro e o halo é vermelho como ele: o cabo é da mesma
 * família de luz do jogo. O núcleo é amarelo, a cor de "pronto" do visor, e
 * não branco, para o cabo nunca ser lido como um rastro de tiro.
 */
const CORE_DIAMETER_M = 0.012
const HALO_DIAMETER_M = 0.05
const CORE_COLOR = new Color3(1, 0.86, 0.36)
const HALO_COLOR = new Color3(1, 0.26, 0.3)
/** O marcador da âncora: pequeno, é um ponto cravado, não uma explosão. */
const MARKER_SIZE_M = 0.32

/**
 * De onde o cabo sai na tela: abaixo e à direita do olho, à frente — a mão
 * esquerda segura a arma, e o lançador fica no pulso direito. Em metros, no
 * espaço da câmera.
 */
const HAND_RIGHT_M = 0.2
const HAND_DOWN_M = 0.24
const HAND_FORWARD_M = 0.4

interface RopeMeshes {
  readonly core: Mesh
  readonly halo: Mesh
  readonly marker: Mesh
}

/**
 * O cabo do gancho na cena e a resposta da câmera. Sem teste: é adapter de
 * engine (ADR 0001) — o disparo, o recolhimento e o efeito de câmera moram em
 * `grappleRope.ts` e `grappleCameraKick.ts`, que são testados.
 *
 * Três malhas para a vida inteira, desligadas fora da corda: nenhuma criação
 * nem descarte por engate, e zero desenho com o gancho solto. Registrado
 * **depois** do passo da sessão e da câmera, para o cabo sair do olho já
 * interpolado deste quadro.
 *
 * Devolve o efeito de câmera, que o dono do fov soma ao de quadril
 * (`kickedFovDeg`).
 *
 * ```ts
 * const kick = driveGrappleView(scene, { camera, character: () => character.current, ... })
 * ```
 */
export function driveGrappleView(scene: Scene, options: GrappleViewOptions): GrappleCameraKick {
  const meshes = createRopeMeshes(scene)
  const rope = createGrappleRope()
  const kick = createGrappleCameraKick(options.motionAllowed)
  const sample = { attached: false, speedMps: 0, lateralMps: 0, maxPullSpeedMps: 1 }
  sample.maxPullSpeedMps = options.config.grapple.maxPullSpeedMps
  scene.onBeforeRenderObservable.add(() => {
    const frameS = options.frameDeltaMs() / 1000
    const state = options.character()
    advanceGrappleRope(rope, state.grappleAttached, state.grappleAnchor, frameS)
    placeRope(meshes, rope, options.camera)
    kick.enabled = options.motionAllowed && !options.headsetActive()
    advanceGrappleCameraKick(kick, sampleOf(state, options.camera, sample), frameS)
    if (!options.headsetActive()) options.camera.rotation.z = kick.rollRad
  })
  return kick
}

function createRopeMeshes(scene: Scene): RopeMeshes {
  const core = additiveMaterial(scene, 'grapple-core', CORE_COLOR)
  const halo = additiveMaterial(scene, 'grapple-halo', HALO_COLOR)
  return {
    core: createBeam(scene, 'grapple-rope', core, CORE_DIAMETER_M),
    halo: createBeam(scene, 'grapple-rope', halo, HALO_DIAMETER_M),
    marker: createFlash(scene, 'grapple-anchor', core, MARKER_SIZE_M),
  }
}

// rascunhos do adapter: o cabo é reposicionado todo quadro com ele preso, e
// nada aqui pode alocar por quadro (nfr.md).
const hand = new Vector3()
const tip = new Vector3()
const tipM = { x: 0, y: 0, z: 0 }
const forward = new Vector3()
const right = new Vector3()
const up = new Vector3()

function placeRope(meshes: RopeMeshes, rope: GrappleRope, camera: UniversalCamera): void {
  meshes.marker.setEnabled(isAnchorMarked(rope))
  meshes.marker.position.set(rope.anchorM.x, rope.anchorM.y, rope.anchorM.z)
  if (!isRopeVisible(rope)) {
    meshes.core.setEnabled(false)
    meshes.halo.setEnabled(false)
    return
  }
  handOf(camera, hand)
  ropeTipM(rope, hand, tipM)
  tip.set(tipM.x, tipM.y, tipM.z)
  const lengthM = Vector3.Distance(hand, tip)
  aimBeam(meshes.core, hand, tip, lengthM)
  aimBeam(meshes.halo, hand, tip, lengthM)
}

function handOf(camera: UniversalCamera, out: Vector3): Vector3 {
  camera.getDirectionToRef(Axis.Z, forward)
  camera.getDirectionToRef(Axis.X, right)
  camera.getDirectionToRef(Axis.Y, up)
  out.copyFrom(camera.position)
  out.addInPlace(forward.scaleInPlace(HAND_FORWARD_M))
  out.addInPlace(right.scaleInPlace(HAND_RIGHT_M))
  out.addInPlace(up.scaleInPlace(-HAND_DOWN_M))
  return out
}

/** A velocidade do tick, e o quanto dela vai para a direita da câmera. */
function sampleOf(
  state: Readonly<CharacterState>,
  camera: UniversalCamera,
  into: { -readonly [Key in keyof GrappleCameraSample]: GrappleCameraSample[Key] },
): GrappleCameraSample {
  const { x, y, z } = state.velocity
  camera.getDirectionToRef(Axis.X, right)
  into.attached = state.grappleAttached
  into.speedMps = Math.sqrt(x * x + y * y + z * z)
  into.lateralMps = x * right.x + z * right.z
  return into
}
