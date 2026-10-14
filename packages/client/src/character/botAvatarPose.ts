import {
  type CharacterState,
  horizontalSpeed,
  type MovementConfig,
  type Vector3,
} from '@shobu/core'
import {
  type ClipSelection,
  type MutableClipSelection,
  type MutableLocomotionPose,
  thirdPersonClipFor,
} from './thirdPersonClips.ts'

/**
 * Do estado de um bot para o que o avatar dele mostra: onde o pé está neste
 * quadro, para onde o corpo olha, e qual clipe toca. Dado puro — quem mexe
 * no babylon é `renderer/driveBotAvatars.ts` — e é o mesmo caminho que um
 * jogador remoto vai percorrer quando o estado vier da rede (ADR 0002).
 */

/**
 * O pé no quadro, misturando o tick anterior e o atual pelo alfa do
 * acumulador: o bot anda a 60 Hz e é desenhado na taxa do monitor, como o
 * jogador (`localCharacter.ts`).
 *
 * ```ts
 * interpolatedFeetM(bot.previousBody, bot.body, character.interpolationAlpha(), feet)
 * ```
 */
export function interpolatedFeetM(
  previous: Readonly<CharacterState>,
  current: Readonly<CharacterState>,
  alpha: number,
  out: Vector3,
): Vector3 {
  out.x = previous.position.x + (current.position.x - previous.position.x) * alpha
  out.y = previous.position.y + (current.position.y - previous.position.y) * alpha
  out.z = previous.position.z + (current.position.z - previous.position.z) * alpha
  return out
}

/**
 * Abaixo disto, a componente do passo é ruído de frenagem e não direção:
 * o corpo não pode piscar entre frente e trás parado.
 */
const STRIDE_AXIS_MPS = 0.5

/**
 * A pose de locomoção de um bot. A direção relativa ao corpo — frente, trás,
 * lado — sai da velocidade projetada na mira, que é para onde o corpo olha:
 * o bot que dá passo lateral trocando tiro toca a corrida virada de lado, como
 * o jogador que anda de lado (`bodyYaw.ts`).
 *
 * ```ts
 * poseOfBot(bot.body, bot.aimM, pose)
 * ```
 */
export function poseOfBot(
  body: Readonly<CharacterState>,
  aimM: Readonly<Vector3>,
  into: MutableLocomotionPose,
): MutableLocomotionPose {
  const facing = Math.sqrt(aimM.x * aimM.x + aimM.z * aimM.z) || 1
  const forwardX = aimM.x / facing
  const forwardZ = aimM.z / facing
  const ahead = body.velocity.x * forwardX + body.velocity.z * forwardZ
  // no babylon (mão esquerda, y para cima) a direita de quem olha para +z é
  // +x: o mesmo sentido do `side` que o teclado escreve.
  const side = body.velocity.x * forwardZ - body.velocity.z * forwardX
  into.stance = body.stance
  into.grounded = body.grounded
  into.horizontalSpeedMps = horizontalSpeed(body)
  into.ahead = strideAxis(ahead)
  into.side = strideAxis(side)
  return into
}

function strideAxis(speedMps: number): -1 | 0 | 1 {
  if (Math.abs(speedMps) < STRIDE_AXIS_MPS) return 0
  return speedMps > 0 ? 1 : -1
}

/** O tombo de quem morreu: uma vez, sem laço, até o respawn levá-lo embora. */
export const BOT_DEATH_CLIP: ClipSelection = { clip: 'Death01', loop: false, speedRatio: 1 }

/**
 * O clipe do bot, escrito em `into`: morto, o tombo; vivo, o da locomoção,
 * como o do jogador. Com a arena pausada (o jogador no menu), o mesmo clipe
 * com velocidade zero: o corpo congela onde estava em vez de correr parado no
 * lugar.
 *
 * ```ts
 * animator.play(botClipFor({ bot, pose, movement, paused }, selection), frameS)
 * ```
 */
export function botClipFor(look: BotLook, into: MutableClipSelection): ClipSelection {
  if (look.alive) thirdPersonClipFor(look.pose, look.movement, into)
  else Object.assign(into, BOT_DEATH_CLIP)
  if (look.paused) into.speedRatio = 0
  return into
}

/** O que decide o clipe de um bot neste quadro. */
export interface BotLook {
  readonly alive: boolean
  readonly pose: Readonly<MutableLocomotionPose>
  readonly movement: MovementConfig
  readonly paused: boolean
}

/**
 * O ângulo de guinada para onde o corpo olha, no plano, com zero em +z. A
 * trigonometria fica aqui, do lado do cliente, como a da câmera
 * (`wishDirection.ts`): o núcleo entrega o vetor, e o desenho o gira.
 *
 * ```ts
 * facingYawRad({ x: 1, y: 0, z: 0 }) // π/2
 * ```
 */
export function facingYawRad(aimM: Readonly<Vector3>): number {
  return Math.atan2(aimM.x, aimM.z)
}

/**
 * De onde o rastro de um bot sai: um palmo à frente do olho e um pouco
 * abaixo, onde fica o cano da arma na mão do avatar. O **raio** saiu do olho,
 * como o do jogador; é só o desenho que sai do cano (`driveArenaWeapon.ts`).
 */
const MUZZLE_AHEAD_M = 0.55
const MUZZLE_DROP_M = 0.18

/**
 * ```ts
 * botMuzzleM(tracer.fromM, bot.aimM, muzzle)
 * ```
 */
export function botMuzzleM(
  eyeM: Readonly<Vector3>,
  aimM: Readonly<Vector3>,
  out: Vector3,
): Vector3 {
  out.x = eyeM.x + aimM.x * MUZZLE_AHEAD_M
  out.y = eyeM.y + aimM.y * MUZZLE_AHEAD_M - MUZZLE_DROP_M
  out.z = eyeM.z + aimM.z * MUZZLE_AHEAD_M
  return out
}
