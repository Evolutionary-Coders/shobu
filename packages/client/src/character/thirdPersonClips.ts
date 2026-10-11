import { type CharacterState, horizontalSpeed, type MovementConfig, type Stance } from '@shobu/core'
import type { HeldKeys } from '../controller/heldKeys.ts'

/**
 * Do estado do controlador para o clipe de terceira pessoa. É a metade TPP da
 * separação FPP/TPP: o mesmo estado lógico (`CharacterState`) toca um clipe de
 * corpo inteiro aqui e vai tocar um clipe de braços e arma no viewmodel — nunca
 * o mesmo conjunto para os dois.
 *
 * Dado puro sobre o `competitor.glb`, hoje o Mannequin das duas Universal
 * Animation Library da Quaternius, mescladas por `scripts/convert-competitor.mjs`.
 * A troca do SWAT por ele **existe por causa deste arquivo**: o SWAT não tinha
 * clipe de pulo, de queda nem de agachado, e no ar o corpo ficava na pose de
 * mira, lendo como travado. Agora tem os três, mais slide e morte.
 *
 * **O que este asset não tem**: strafe. O SWAT tinha `Run_Left/Right/Back` e a
 * UAL não tem nenhum. Ir para trás toca a corrida ao contrário (`speedRatio`
 * negativo), que lê bem; o strafe puro toca a corrida para a frente, e quem
 * resolve a leitura é o giro da raiz do avatar no renderer.
 */
export type ThirdPersonClip =
  | 'Pistol_Idle_Loop'
  | 'Crouch_Idle_Loop'
  | 'Crouch_Fwd_Loop'
  | 'Walk_Loop'
  | 'Jog_Fwd_Loop'
  | 'Sprint_Loop'
  | 'Jump_Start'
  | 'Jump_Loop'
  | 'Jump_Land'
  | 'NinjaJump_Idle_Loop'
  | 'Slide_Start'
  | 'Slide_Loop'
  | 'Death01'

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

/** Velocidade em que o `Jog_Fwd_Loop` foi autorado, medida contra a corrida base. */
const RUN_CLIP_SPEED_RATIO_AT_RUN = 1

/** Acima disto é sprint, e o clipe de sprint lê melhor que o jog acelerado. */
const SPRINT_SPEED_RATIO = 1.25

/**
 * ```ts
 * thirdPersonClipFor({ stance: 'standing', grounded: true, horizontalSpeedMps: 6, ahead: 1, side: 0 }, movement)
 * // { clip: 'Jog_Fwd_Loop', loop: true, speedRatio: 1.15 }
 * ```
 */
export function thirdPersonClipFor(pose: LocomotionPose, movement: MovementConfig): ClipSelection {
  if (pose.stance === 'sliding') return loop('Slide_Loop', 1)
  if (!pose.grounded) return loop('Jump_Loop', 1)
  if (pose.stance === 'crouching') return crouchClipFor(pose, movement)
  if (pose.horizontalSpeedMps < IDLE_SPEED_MPS) return loop('Pistol_Idle_Loop', 1)
  return runClipFor(pose, movement)
}

/** Agachado parado tem clipe próprio: antes ele ficava de pé com a corrida devagar. */
function crouchClipFor(pose: LocomotionPose, movement: MovementConfig): ClipSelection {
  if (pose.horizontalSpeedMps < IDLE_SPEED_MPS) return loop('Crouch_Idle_Loop', 1)
  return loop('Crouch_Fwd_Loop', pose.horizontalSpeedMps / movement.crouchSpeedMps)
}

/**
 * A UAL não tem strafe. Ir para trás é a corrida ao contrário, que lê bem
 * porque os pés continuam batendo no chão na direção certa; o strafe puro toca
 * a corrida para a frente, e quem corrige a leitura é o giro da raiz do avatar.
 */
function runClipFor(pose: LocomotionPose, movement: MovementConfig): ClipSelection {
  const ratio = (pose.horizontalSpeedMps / movement.runSpeedMps) * RUN_CLIP_SPEED_RATIO_AT_RUN
  if (pose.ahead < 0) return loop('Jog_Fwd_Loop', -ratio)
  if (ratio > SPRINT_SPEED_RATIO) {
    return loop('Sprint_Loop', pose.horizontalSpeedMps / movement.sprintSpeedMps)
  }
  return loop('Jog_Fwd_Loop', ratio)
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
