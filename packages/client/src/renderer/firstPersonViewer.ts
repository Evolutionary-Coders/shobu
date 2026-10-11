import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import type { ArenaRendererOptions } from './arenaRenderer.ts'
import { createLockedMouseLook, type LockedMouseLook, type LookTurn } from './lockedMouseLook.ts'
import { BASE_PIXELS_PER_RADIAN } from './lookSensitivity.ts'

/**
 * Pixels de mouse por radiano. O padrão do babylon é 2000 **com** inércia 0,9,
 * e a inércia soma a rotação por dez quadros — o ganho efetivo era 200. Sem
 * inércia o número tem que ser o efetivo, senão a mira fica dez vezes mais dura.
 */

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
): FirstPersonViewer {
  const { config } = options
  const camera = new UniversalCamera('viewer', Vector3.FromArray([...options.spawnPointM]), scene)
  // o fov não é escrito aqui: quem compõe fov base, lente de entrada e luneta é
  // `firstPersonLens.ts`, e dois donos do mesmo campo é último-a-escrever-ganha.
  camera.minZ = 0.1
  // o que não dá para acertar não precisa desenhar. O cenário de fundo do
  // blender tem que caber dentro deste raio, e é o bake que respeita isso.
  camera.maxZ = config.weapon.hitscanRangeM
  // olhar para o centro da arena: o spawn fica na quina, e a primeira coisa
  // que o jogador vê tem que ser a verticalidade, não a parede às costas dele.
  camera.setTarget(Vector3.Zero())
  camera.inputs.clear()
  camera.inertia = 0
  const look = createLockedMouseLook(BASE_PIXELS_PER_RADIAN)
  const detach = attachLockedMouseLook(camera, options.canvas, look)
  scene.onDisposeObservable.addOnce(detach)
  return { camera, look }
}

export interface FirstPersonViewer {
  readonly camera: UniversalCamera
  /** O dono do ganho do mouse: é nele, e não na câmera, que a sensibilidade é escrita. */
  readonly look: LockedMouseLook
}

/**
 * O mouse do babylon sai inteiro (`lockedMouseLook.ts` diz por quê) e entra um
 * `mousemove` no documento, que só vale com a trava no canvas. O giro vai para
 * `cameraRotation`, o mesmo campo que o babylon usava; sem inércia, ele é
 * aplicado inteiro no quadro seguinte e zera — num sniper, a mira que continua
 * andando depois de o mouse parar é a diferença entre acertar e não.
 */
function attachLockedMouseLook(
  camera: UniversalCamera,
  canvas: HTMLCanvasElement,
  look: LockedMouseLook,
): () => void {
  const turn: LookTurn = { x: 0, y: 0 }
  const onLockChange = (): void => look.lockChanged(document.pointerLockElement === canvas)
  const onMove = (event: MouseEvent): void => {
    if (!look.turn(event.movementX, event.movementY, turn)) return
    camera.cameraRotation.x += turn.x
    camera.cameraRotation.y += turn.y
  }
  document.addEventListener('pointerlockchange', onLockChange)
  document.addEventListener('mousemove', onMove)
  return () => {
    document.removeEventListener('pointerlockchange', onLockChange)
    document.removeEventListener('mousemove', onMove)
  }
}
