import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { Vector3 } from '../math/vector3.ts'
import { type CharacterState, horizontalSpeed } from './characterState.ts'
import { hasWish, type MovementInput, wishUnit } from './movementInput.ts'

/**
 * Aceleração no plano do chão, no chão e no ar. É a parte do controlador que
 * define o feel de call of duty modern warfare 2019: aceleração e frenagem
 * altas, então a velocidade responde no tick e não "escorrega".
 *
 * A composição das três forças no ar, que o modelo de simulação deixou em
 * aberto, fica decidida aqui: **aceleração primeiro, depois teto sobre o
 * módulo da velocidade horizontal, e o teto é o maior entre `airSpeedCapMps`
 * e a velocidade que o jogador já tinha.** Acelerar no ar nunca passa do
 * teto; o excedente que veio de slide ou gancho é preservado, não cortado —
 * é a regra do modelo de "desaceleração só do excedente", com o excedente
 * intacto enquanto o jogador está no ar.
 */

/** Um centésimo de m/s: abaixo disso "acima da corrida" é ruído de ponto flutuante. */
const SPEED_EPSILON_MPS = 0.01

/**
 * Corrida tática só existe no chão e com direção pedida. Shift preso parado
 * não é corrida, e shift no ar não muda nada — o ar tem as próprias regras.
 */
export function updateSprint(state: CharacterState, input: MovementInput): void {
  state.sprinting = state.stance === 'standing' && state.grounded && input.sprint && hasWish(input)
}

/**
 * No chão a velocidade **converge** para a desejada: acelera se está abaixo,
 * freia se está acima ou se não há pedido. Frenagem e não aceleração para o
 * excedente é a regra do modelo: é o que devolve o jogador à corrida depois
 * de um slide, com ou sem input.
 */
export function steerOnGround(
  state: CharacterState,
  input: MovementInput,
  config: GameplayConfig,
  dtS: number,
): void {
  const targetSpeed = groundTargetSpeed(state, config)
  const desiredX = wishUnit(input, 'x') * targetSpeed
  const desiredZ = wishUnit(input, 'z') * targetSpeed
  const accelerating = hasWish(input) && horizontalSpeed(state) <= targetSpeed + SPEED_EPSILON_MPS
  const { groundAccelerationMps2, groundFrictionMps2 } = config.movement
  const rate = accelerating ? groundAccelerationMps2 : groundFrictionMps2
  moveHorizontalToward(state.velocity, desiredX, desiredZ, rate * dtS)
}

/** Agachado anda devagar; correndo com shift, rápido; o resto é a corrida base. */
export function groundTargetSpeed(state: Readonly<CharacterState>, config: GameplayConfig): number {
  const { movement } = config
  if (state.stance === 'crouching') return movement.crouchSpeedMps
  return state.sprinting ? movement.sprintSpeedMps : movement.runSpeedMps
}

export function steerInAir(
  state: CharacterState,
  input: MovementInput,
  config: GameplayConfig,
  dtS: number,
): void {
  const { movement } = config
  const speedBefore = horizontalSpeed(state)
  state.velocity.x += wishUnit(input, 'x') * movement.airAccelerationMps2 * dtS
  state.velocity.z += wishUnit(input, 'z') * movement.airAccelerationMps2 * dtS
  clampHorizontal(state.velocity, Math.max(movement.airSpeedCapMps, speedBefore))
}

/** Move o vetor horizontal em direção ao desejado, no máximo `maxDelta` neste tick. */
function moveHorizontalToward(
  velocity: Vector3,
  desiredX: number,
  desiredZ: number,
  maxDelta: number,
): void {
  const deltaX = desiredX - velocity.x
  const deltaZ = desiredZ - velocity.z
  const distance = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ)
  if (distance <= maxDelta) {
    velocity.x = desiredX
    velocity.z = desiredZ
    return
  }
  velocity.x += (deltaX / distance) * maxDelta
  velocity.z += (deltaZ / distance) * maxDelta
}

/** O teto explícito da ADR 0003, só no plano do chão: a gravidade é de outro eixo. */
export function clampHorizontal(velocity: Vector3, maxSpeed: number): void {
  const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z)
  if (speed <= maxSpeed) return
  const scale = maxSpeed / speed
  velocity.x *= scale
  velocity.z *= scale
}
