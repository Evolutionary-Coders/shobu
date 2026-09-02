import '@babylonjs/core/Cameras/Inputs/freeCameraKeyboardMoveInput'
import '@babylonjs/core/Cameras/Inputs/freeCameraMouseInput'
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import type { ArenaRendererOptions } from './arenaRenderer.ts'
import { verticalFovRad } from './fieldOfView.ts'

/** Códigos de tecla do wasd. Não são número de gameplay, são o teclado. */
const WASD = { up: [87], down: [83], left: [65], right: [68] } as const

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
  applyPlaceholderLocomotion(camera, options)
  Object.assign(camera, { keysUp: WASD.up, keysDown: WASD.down })
  Object.assign(camera, { keysLeft: WASD.left, keysRight: WASD.right })
  return camera
}

/**
 * `speed` e `gravity` do babylon são por quadro, não por segundo. Dividir pelo
 * tick rate dá a ordem de grandeza certa a 60 Hz — é aproximação de
 * placeholder, e é por isso que o viewer não serve de controlador.
 */
function applyPlaceholderLocomotion(camera: UniversalCamera, options: ArenaRendererOptions): void {
  const { config } = options
  const { capsuleRadiusM, capsuleHeightM } = config.collision
  camera.speed = config.movement.runSpeedMps / config.simulation.tickHz
  camera.ellipsoid = new Vector3(capsuleRadiusM, capsuleHeightM / 2, capsuleRadiusM)
  camera.checkCollisions = true
  camera.applyGravity = true
}
