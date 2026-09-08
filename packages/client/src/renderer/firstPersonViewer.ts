import '@babylonjs/core/Cameras/Inputs/freeCameraKeyboardMoveInput'
import '@babylonjs/core/Cameras/Inputs/freeCameraMouseInput'
// sem este import, `checkCollisions` na câmera lança "DefaultCollisionCoordinator
// needs to be imported before" no primeiro quadro em que há entrada de teclado:
// o babylon em es6 registra o coordenador por efeito colateral, e nada aqui o
// puxava. era por isso que o wasd não movia nada.
import '@babylonjs/core/Collisions/collisionCoordinator'
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import type { ArenaRendererOptions } from './arenaRenderer.ts'
import { verticalFovRad } from './fieldOfView.ts'

/** Códigos de tecla do wasd. Não são número de gameplay, são o teclado. */
const WASD = { up: [87], down: [83], left: [65], right: [68] } as const

/**
 * Pixels de mouse por radiano. O padrão do babylon é 2000 **com** inércia 0,9,
 * e a inércia soma a rotação por dez quadros — o ganho efetivo era 200. Sem
 * inércia o número tem que ser o efetivo, senão a mira fica dez vezes mais dura.
 */
const MOUSE_PIXELS_PER_RADIAN = 200

/**
 * Quanto o babylon anda por segundo para cada unidade de `speed` com inércia
 * zero. Sai de `_computeLocalCameraSpeed`, que é `speed * sqrt(dt / (fps * 100))`
 * por quadro: multiplicado por fps quadros, dá `speed * sqrt(10)`.
 */
const BABYLON_METERS_PER_SECOND_PER_SPEED = Math.sqrt(10)

/**
 * Câmera de inspeção em primeira pessoa, **descartável de propósito**.
 *
 * A ADR 0003 decide que o jogador é cinemático, vive fora do motor de física e
 * roda no mesmo módulo `.ts` puro no cliente e no servidor. Isto aqui é o
 * oposto: colisão e gravidade do babylon, sem tick fixo e sem determinismo.
 * Existe para o greybox ser navegável antes de o controlador existir, e sai
 * inteiro quando ele chegar. Nada de gameplay pode passar a depender dela.
 */
export function createFirstPersonViewer(
  scene: Scene,
  options: ArenaRendererOptions,
): UniversalCamera {
  const { config, canvas } = options
  const camera = new UniversalCamera('viewer', Vector3.FromArray([...options.spawnPointM]), scene)
  camera.fov = verticalFovRad(config.camera.baseFovDeg, canvas.clientWidth / canvas.clientHeight)
  camera.minZ = 0.1
  camera.maxZ = config.weapon.hitscanRangeM
  // olhar para o centro da arena: o spawn fica na quina, e a primeira coisa
  // que o jogador vê tem que ser a verticalidade, não a parede às costas dele.
  camera.setTarget(Vector3.Zero())
  removeInputSmoothing(camera)
  applyPlaceholderLocomotion(camera, options)
  Object.assign(camera, { keysUp: WASD.up, keysDown: WASD.down })
  Object.assign(camera, { keysLeft: WASD.left, keysRight: WASD.right })
  return camera
}

/**
 * Sem inércia: o babylon suaviza mouse e teclado com um decaimento de 0,9 por
 * quadro, e num sniper a mira que continua andando depois de o mouse parar é
 * a diferença entre acertar e não. Zero tira a suavização dos dois — o
 * teclado também responde no quadro em que a tecla desce.
 */
function removeInputSmoothing(camera: UniversalCamera): void {
  camera.inertia = 0
  camera.angularSensibility = MOUSE_PIXELS_PER_RADIAN
}

/**
 * `gravity` do babylon é por quadro, não por segundo, e `speed` tem a escala
 * própria dele (ver `BABYLON_METERS_PER_SECOND_PER_SPEED`). As duas conversões
 * são aproximação de placeholder, e é por isso que o viewer não serve de
 * controlador (ADR 0003).
 */
function applyPlaceholderLocomotion(camera: UniversalCamera, options: ArenaRendererOptions): void {
  const { config } = options
  const { capsuleRadiusM, capsuleHeightM } = config.collision
  camera.speed = config.movement.runSpeedMps / BABYLON_METERS_PER_SECOND_PER_SPEED
  camera.ellipsoid = new Vector3(capsuleRadiusM, capsuleHeightM / 2, capsuleRadiusM)
  camera.checkCollisions = true
  camera.applyGravity = true
}
