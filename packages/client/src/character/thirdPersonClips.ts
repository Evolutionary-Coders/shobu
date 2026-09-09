import { type CharacterState, horizontalSpeed, type MovementConfig, type Stance } from '@shobu/core'
import type { HeldKeys } from '../controller/heldKeys.ts'

/**
 * Do estado do controlador para o clipe de terceira pessoa. É a metade TPP da
 * separação FPP/TPP: o mesmo estado lógico (`CharacterState`) toca um clipe de
 * corpo inteiro aqui e vai tocar um clipe de braços e arma no viewmodel — nunca
 * o mesmo conjunto para os dois.
 *
 * Dado puro sobre o `competitor.glb` (SWAT da Quaternius). Os nomes são os dos
 * `AnimationGroup` do glb, com o prefixo de armature que o `FBX2glTF` deixou.
 *
 * **O que o asset não tem**, e como isto contorna até a issue de animação
 * fechar: não há clipe de pulo, queda nem agachado (ver
 * `docs/asset-licenses.md`). No ar o corpo fica na pose de mira, que lê como
 * "travado"; agachado anda com o `Walk`, que é mais baixo que o `Run`. A
 * Universal Animation Library tem os dois clipes, mas em outro rig — o
 * caminho é o retarget no blender, registrado na mesma issue.
 */
export type ThirdPersonClip =
  | 'CharacterArmature|Idle_Gun'
  | 'CharacterArmature|Idle_Gun_Pointing'
  | 'CharacterArmature|Walk'
  | 'CharacterArmature|Run'
  | 'CharacterArmature|Run_Back'
  | 'CharacterArmature|Run_Left'
  | 'CharacterArmature|Run_Right'
  | 'CharacterArmature|Roll'

export interface ClipSelection {
  readonly clip: ThirdPersonClip
  readonly loop: boolean
  /** 1 é a velocidade em que o clipe foi autorado; acima disso os pés acompanham o chão. */
  readonly speedRatio: number
}

/** O que a escolha do clipe precisa saber do jogador, em termos do corpo dele. */
export interface LocomotionPose {
  readonly stance: Stance
  readonly grounded: boolean
  readonly horizontalSpeedMps: number
  /** Para onde o corpo está indo em relação a onde olha: 1 frente, -1 trás, 0 nenhum. */
  readonly ahead: -1 | 0 | 1
  /** 1 direita, -1 esquerda, 0 nenhum. */
  readonly side: -1 | 0 | 1
}

/** Abaixo disto é parado: o ruído da frenagem não pode piscar o `Walk`. */
const IDLE_SPEED_MPS = 0.3

/** Velocidade em que o `Run` do SWAT foi autorado, medida contra a corrida base. */
const RUN_CLIP_SPEED_RATIO_AT_RUN = 1

/**
 * ```ts
 * thirdPersonClipFor({ stance: 'standing', grounded: true, horizontalSpeedMps: 12, ahead: 1, side: 0 }, movement)
 * // { clip: 'CharacterArmature|Run', loop: true, speedRatio: 1.33 }
 * ```
 */
export function thirdPersonClipFor(pose: LocomotionPose, movement: MovementConfig): ClipSelection {
  if (pose.stance === 'sliding') return loop('CharacterArmature|Roll', 1)
  if (!pose.grounded) return loop('CharacterArmature|Idle_Gun_Pointing', 1)
  if (pose.horizontalSpeedMps < IDLE_SPEED_MPS) return loop('CharacterArmature|Idle_Gun', 1)
  if (pose.stance === 'crouching') {
    return loop('CharacterArmature|Walk', pose.horizontalSpeedMps / movement.crouchSpeedMps)
  }
  const ratio = (pose.horizontalSpeedMps / movement.runSpeedMps) * RUN_CLIP_SPEED_RATIO_AT_RUN
  return loop(runClipFor(pose), ratio)
}

/** Frente e trás mandam; strafe puro usa os clipes laterais. */
function runClipFor(pose: LocomotionPose): ThirdPersonClip {
  if (pose.ahead < 0) return 'CharacterArmature|Run_Back'
  if (pose.ahead > 0 || pose.side === 0) return 'CharacterArmature|Run'
  return pose.side > 0 ? 'CharacterArmature|Run_Right' : 'CharacterArmature|Run_Left'
}

function loop(clip: ThirdPersonClip, speedRatio: number): ClipSelection {
  return { clip, loop: true, speedRatio }
}

/** A pose que o cliente preenche por quadro e reaproveita — sem alocar. */
export type MutableLocomotionPose = {
  -readonly [Key in keyof LocomotionPose]: LocomotionPose[Key]
}

export function createLocomotionPose(): MutableLocomotionPose {
  return { stance: 'standing', grounded: false, horizontalSpeedMps: 0, ahead: 0, side: 0 }
}

/**
 * A pose do jogador local, a partir do estado do núcleo e das teclas. As
 * teclas dão a direção **relativa ao corpo** que a velocidade em mundo não
 * dá: para saber se é strafe é preciso saber para onde o jogador olha, e o
 * teclado já é isso.
 *
 * ```ts
 * poseOfLocalCharacter(character.current, keys, pose)
 * ```
 */
export function poseOfLocalCharacter(
  state: Readonly<CharacterState>,
  keys: Readonly<HeldKeys>,
  into: MutableLocomotionPose,
): MutableLocomotionPose {
  into.stance = state.stance
  into.grounded = state.grounded
  into.horizontalSpeedMps = horizontalSpeed(state)
  into.ahead = axis(keys.forward, keys.back)
  into.side = axis(keys.right, keys.left)
  return into
}

function axis(positive: boolean, negative: boolean): -1 | 0 | 1 {
  if (positive === negative) return 0
  return positive ? 1 : -1
}
