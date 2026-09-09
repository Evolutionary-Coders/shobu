import '@babylonjs/core/Cameras/Inputs/freeCameraMouseInput'
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import type { ArenaRendererOptions } from './arenaRenderer.ts'
import { verticalFovRad } from './fieldOfView.ts'

/**
 * Pixels de mouse por radiano. O padrão do babylon é 2000 **com** inércia 0,9,
 * e a inércia soma a rotação por dez quadros — o ganho efetivo era 200. Sem
 * inércia o número tem que ser o efetivo, senão a mira fica dez vezes mais dura.
 */
const MOUSE_PIXELS_PER_RADIAN = 200

/**
 * A câmera em primeira pessoa: **só olha**. Quem anda é o controlador do
 * núcleo (`stepCharacter`), e `driveCameraFromCharacter.ts` copia a posição
 * dele para cá a cada quadro. É a divisão da ADR 0003: o mouse é render, e
 * responde na taxa do monitor; a posição é simulação, e anda em tick fixo.
 *
 * Por isso a câmera não tem teclado, gravidade nem colisão do babylon — tudo
 * isso vivia aqui quando este módulo era um viewer descartável, e saiu inteiro
 * quando o controlador chegou, como o próprio viewer prometia.
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
  keepOnlyMouseLook(camera)
  return camera
}

/**
 * Sem inércia: o babylon suaviza o mouse com um decaimento de 0,9 por quadro,
 * e num sniper a mira que continua andando depois de o mouse parar é a
 * diferença entre acertar e não.
 */
function keepOnlyMouseLook(camera: UniversalCamera): void {
  camera.inputs.clear()
  camera.inputs.addMouse(false)
  camera.inertia = 0
  camera.angularSensibility = MOUSE_PIXELS_PER_RADIAN
}
