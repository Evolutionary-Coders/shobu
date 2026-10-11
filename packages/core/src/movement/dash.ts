import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { CharacterState } from './characterState.ts'
import type { MovementInput } from './movementInput.ts'

/**
 * A investida da katana (ADR 0021): a velocidade horizontal vira
 * `melee.dashSpeedMps` na direção da mira, de uma vez. Quem a desfaz é o
 * atrito do chão, que freia o excedente acima da corrida — é o que torna a
 * investida curta sem cronômetro próprio.
 *
 * Só de pé e no chão: no ar o excedente é preservado (`steerInAir`), e a
 * investida viraria um voo. Mira na vertical não tem direção no chão, e não
 * investe.
 *
 * ```ts
 * if (input.dash) applyDash(state, input, config)
 * ```
 */
export function applyDash(
  state: CharacterState,
  input: MovementInput,
  config: GameplayConfig,
): void {
  if (!state.grounded || state.stance !== 'standing') return
  const length = Math.sqrt(input.aimX * input.aimX + input.aimZ * input.aimZ)
  if (length === 0) return
  const speed = config.melee.dashSpeedMps
  state.velocity.x = (input.aimX / length) * speed
  state.velocity.z = (input.aimZ / length) * speed
}
