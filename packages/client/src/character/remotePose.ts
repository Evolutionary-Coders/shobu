import type { Vector3 } from '@shobu/core'
import { planarUnit } from '../controller/wishDirection.ts'
import type { RemotePlayerView } from '../net/remotePlayerView.ts'
import type { MutableLocomotionPose } from './thirdPersonClips.ts'

/**
 * Seno de 22,5°: a velocidade conta como "para a frente" ou "de lado" quando a
 * componente passa desta fração dela. Divide o círculo em oito setores, como os
 * clipes de corrida, e a diagonal pega as duas direções.
 */
const DIRECTION_SHARE = 0.383

/**
 * A pose de um jogador remoto para o animador. O local lê a direção do teclado;
 * o remoto não tem teclado, então a direção sai do movimento: a posição
 * interpolada deste quadro menos a do anterior, projetada na mira. "Direita" é
 * o eixo X local da câmera no plano do chão, `(frente.z, -frente.x)`, a mesma
 * base que `driveCameraFromCharacter` usa.
 *
 * ```ts
 * poseOfRemotePlayer(view, previousFeetM, frameS, pose)
 * avatar.animator.play(thirdPersonClipFor(pose, config.movement), frameS)
 * ```
 */
export function poseOfRemotePlayer(
  view: Readonly<RemotePlayerView>,
  previousFeetM: Readonly<Vector3>,
  frameS: number,
  into: MutableLocomotionPose,
): MutableLocomotionPose {
  into.stance = view.stance
  into.grounded = view.grounded
  const velocityX = frameS > 0 ? (view.feetM.x - previousFeetM.x) / frameS : 0
  const velocityZ = frameS > 0 ? (view.feetM.z - previousFeetM.z) / frameS : 0
  into.horizontalSpeedMps = Math.sqrt(velocityX * velocityX + velocityZ * velocityZ)
  const [forwardX, forwardZ] = planarUnit(view.aim.x, view.aim.y, view.aim.z)
  into.ahead = direction(velocityX * forwardX + velocityZ * forwardZ, into.horizontalSpeedMps)
  into.side = direction(velocityX * forwardZ - velocityZ * forwardX, into.horizontalSpeedMps)
  return into
}

function direction(component: number, speed: number): -1 | 0 | 1 {
  if (component > DIRECTION_SHARE * speed) return 1
  if (component < -DIRECTION_SHARE * speed) return -1
  return 0
}
