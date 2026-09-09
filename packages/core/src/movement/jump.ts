import type { GameplayConfig } from '../config/gameplayConfig.ts'
import { type CharacterState, JUMPS_PER_FLIGHT } from './characterState.ts'

/**
 * Salvaguarda, não regra ativa (modelo de simulação): existe para o caso de o
 * jogador sair da geometria esperada. A queda mais alta da arena, do telhado
 * ao beco, chega perto de 27 m/s — bem abaixo.
 */
export const TERMINAL_FALL_MPS = 60

/**
 * Pulo e pulo duplo. O segundo impulso é **atribuição**, não soma: o jogador
 * passa a subir a `doubleJumpImpulseMps`, esteja caindo ou subindo. É o que
 * faz o pulo duplo servir de correção no ápice e de resgate na queda, que é
 * o feel de destiny 2.
 *
 * Quem sai de uma borda andando ainda tem os dois pulos: o primeiro no ar usa
 * o impulso cheio. Sem isso, cair de um deck sem ter pulado custaria o pulo
 * principal, e a movimentação puniria quem se moveu (pilar 3).
 *
 * ```ts
 * tryJump(state, config) // true se pulou
 * ```
 */
export function tryJump(state: CharacterState, config: GameplayConfig): boolean {
  if (state.jumpsLeft <= 0) return false
  const isFirst = state.jumpsLeft === JUMPS_PER_FLIGHT
  const { movement } = config
  state.velocity.y = isFirst ? movement.jumpImpulseMps : movement.doubleJumpImpulseMps
  state.jumpsLeft -= 1
  state.grounded = false
  return true
}

export function applyGravity(state: CharacterState, config: GameplayConfig, dtS: number): void {
  state.velocity.y += config.movement.gravityMps2 * dtS
  if (state.velocity.y < -TERMINAL_FALL_MPS) state.velocity.y = -TERMINAL_FALL_MPS
}

/**
 * Chão tocado: os pulos recarregam e a velocidade vertical para de acumular.
 * Sem zerar `velocity.y`, a gravidade de um tick sobreviveria ao contato e o
 * primeiro pulo sairia mais fraco que o configurado.
 */
export function settleOnGround(state: CharacterState): void {
  if (!state.grounded) return
  state.jumpsLeft = JUMPS_PER_FLIGHT
  if (state.velocity.y < 0) state.velocity.y = 0
}
