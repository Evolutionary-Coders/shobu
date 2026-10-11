import type { GameplayConfig } from '../config/gameplayConfig.ts'
import { type CharacterState, horizontalSpeed, type Stance } from './characterState.ts'
import { CROUCH_CAPSULE_RATIO } from './crouch.ts'

/**
 * Slide e slide cancel, com o feel de call of duty modern warfare 2019 e as
 * regras do modelo de simulação:
 *
 * - **entrada exige corrida tática quase plena**: senão o slide vira botão de
 *   agachar, e agachar não é mecânica deste jogo.
 * - **a velocidade de entrada é atribuição**: o jogador passa a ter a
 *   velocidade de slide, não soma à que tinha. É o que impede a cadeia de
 *   acumular a cada ciclo.
 * - **desacelera enquanto dura**, e cancelar herda a velocidade do instante:
 *   quem cancela mais cedo herda mais. É o coração da mecânica.
 * - **a cápsula encolhe**, e volta ao fim.
 * - **o cooldown conta do fim**, não da entrada.
 * - **quem segura a tecla até o fim sai agachado**, como no modern warfare;
 *   quem soltou sai de pé.
 */

/** Fração da corrida tática que a entrada exige. */
export const SLIDE_ENTRY_SPEED_RATIO = 0.9

/** Altura da cápsula no slide, em fração da altura em pé. */
export const SLIDE_CAPSULE_RATIO = 0.5

export interface SlideEdges {
  readonly jumpPressed: boolean
  readonly crouchPressed: boolean
  /** A tecla ainda presa no fim decide a postura de saída. */
  readonly crouchHeld: boolean
}

/**
 * Derivada do modelo, não chave de config: a desaceleração que faz um slide
 * inteiro terminar **exatamente** na velocidade de corrida. Com ela o fim do
 * slide não dá salto de velocidade para nenhum lado.
 *
 * ```ts
 * slideDecelerationMps2(config) // (13 - 9) / 0.7 ≈ 5.71
 * ```
 */
export function slideDecelerationMps2(config: GameplayConfig): number {
  const { slideImpulseMps, runSpeedMps, slideDurationS } = config.movement
  return (slideImpulseMps - runSpeedMps) / slideDurationS
}

export function canStartSlide(state: Readonly<CharacterState>, config: GameplayConfig): boolean {
  if (state.stance !== 'standing' || !state.grounded || !state.sprinting) return false
  if (state.slideCooldownLeftS > 0) return false
  return horizontalSpeed(state) >= SLIDE_ENTRY_SPEED_RATIO * config.movement.sprintSpeedMps
}

/** Pressupõe `canStartSlide`: a direção sai da velocidade atual, que não é zero. */
export function startSlide(state: CharacterState, config: GameplayConfig): void {
  const speed = horizontalSpeed(state)
  const scale = config.movement.slideImpulseMps / speed
  state.velocity.x *= scale
  state.velocity.z *= scale
  state.stance = 'sliding'
  state.slideTimeLeftS = config.movement.slideDurationS
  state.capsuleHeightM = config.collision.capsuleHeightM * SLIDE_CAPSULE_RATIO
  state.sprinting = false
}

/**
 * Um tick de slide. Termina por tempo, por sair do chão, por pulo, ou por
 * cancel — e o cancel com a própria tecla só vale depois de
 * `slideCancelWindowS`, senão o segundo toque de quem aperta duas vezes
 * cancela o slide que acabou de começar.
 *
 * O pulo sempre sai: pular do slide é o jeito de levar a velocidade herdada
 * para o ar, onde ela não decai (ver `steer.ts`).
 */
export function continueSlide(
  state: CharacterState,
  edges: SlideEdges,
  config: GameplayConfig,
  dtS: number,
): void {
  state.slideTimeLeftS -= dtS
  const elapsedS = config.movement.slideDurationS - state.slideTimeLeftS
  const cancelled = edges.crouchPressed && elapsedS >= config.movement.slideCancelWindowS
  if (edges.jumpPressed || cancelled) {
    endSlide(state, config, 'standing')
    return
  }
  if (!state.grounded || state.slideTimeLeftS <= 0) {
    endSlide(state, config, edges.crouchHeld ? 'crouching' : 'standing')
    return
  }
  decelerateSlide(state, config, dtS)
}

/** Sai de pé ou agachado. Quem levanta depois passa pela checagem de teto de `crouch.ts`. */
export function endSlide(
  state: CharacterState,
  config: GameplayConfig,
  nextStance: Exclude<Stance, 'sliding'>,
): void {
  const ratio = nextStance === 'crouching' ? CROUCH_CAPSULE_RATIO : 1
  state.stance = nextStance
  state.slideTimeLeftS = 0
  state.capsuleHeightM = config.collision.capsuleHeightM * ratio
  state.slideCooldownLeftS = config.movement.slideCooldownS
}

/** Nunca abaixo da corrida: o piso do decaimento é a corrida (pilar 3). */
function decelerateSlide(state: CharacterState, config: GameplayConfig, dtS: number): void {
  const speed = horizontalSpeed(state)
  const floor = config.movement.runSpeedMps
  const next = Math.max(floor, speed - slideDecelerationMps2(config) * dtS)
  if (speed === 0 || next === speed) return
  const scale = next / speed
  state.velocity.x *= scale
  state.velocity.z *= scale
}
