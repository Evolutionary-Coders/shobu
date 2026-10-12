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
  if (!canDash(state, input.aimX, input.aimZ)) return
  const length = Math.sqrt(input.aimX * input.aimX + input.aimZ * input.aimZ)
  const speed = config.melee.dashSpeedMps
  state.velocity.x = (input.aimX / length) * speed
  state.velocity.z = (input.aimZ / length) * speed
}

/**
 * O corpo daria a investida agora: no chão, de pé, e com a mira apontando
 * para algum lado no plano. É a **mesma** pergunta que o corpo a corpo faz
 * antes de gastar a recarga (`stepMelee`) e que `applyDash` faz antes de
 * lançar — separadas, a katana gastava a recarga agachada ou mirando na
 * vertical sem o corpo sair do lugar (revisão do núcleo).
 *
 * ```ts
 * canDash(body, aimM.x, aimM.z) // false agachado
 * ```
 */
export function canDash(body: Readonly<CharacterState>, aimX: number, aimZ: number): boolean {
  if (!body.grounded || body.stance !== 'standing') return false
  return aimX * aimX + aimZ * aimZ > 0
}
