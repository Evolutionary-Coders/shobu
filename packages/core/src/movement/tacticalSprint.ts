import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { CharacterState } from './characterState.ts'
import type { MovementInput } from './movementInput.ts'

/**
 * A corrida tática plena, o shift duplo do warzone (ADR 0021). Roda **depois**
 * de `updateSprint`, porque só existe por cima da corrida tática: o que derruba
 * a corrida (parar, agachar, mirar, sair do chão) derruba esta também.
 *
 * As regras, e por que cada uma:
 * - **dois apertos do shift dentro de `sprintDoubleTapS`** a ligam — ou um
 *   aperto até `sprintDoubleTapS` depois de a corrida parar, que é soltar e
 *   reapertar o shift correndo. O segundo aperto é o gesto; o shift preso
 *   depois dele a mantém, como a corrida.
 * - **um tanque** a limita: ela é a arrancada para atravessar a rua, não o
 *   jeito normal de andar. Vazio, cai para a corrida comum sem soltar a tecla.
 * - **o tanque espera antes de encher**: senão soltar e reapertar o shift a
 *   cada meio segundo daria corrida plena infinita.
 *
 * ```ts
 * updateSprint(state, input)
 * updateTacticalSprint(state, input, config, dtS)
 * ```
 */
export function updateTacticalSprint(
  state: CharacterState,
  input: MovementInput,
  config: GameplayConfig,
  dtS: number,
): void {
  if (readSecondTap(state, input, config, dtS) && state.sprinting) state.tacticalSprinting = true
  if (!state.sprinting || state.tacticalTankS <= 0) state.tacticalSprinting = false
  if (state.tacticalSprinting) drainTank(state, config, dtS)
  else refillTank(state, config, dtS)
}

/** Abre a janela a cada aperto, e diz se este aperto caiu dentro da janela do anterior. */
function readSecondTap(
  state: CharacterState,
  input: MovementInput,
  config: GameplayConfig,
  dtS: number,
): boolean {
  const pressed = input.sprint && !state.sprintWasHeld
  const secondTap = pressed && state.sprintTapLeftS > 0
  // correr também mantém a janela aberta: soltar e reapertar o shift no meio
  // da corrida é o "apertar de novo já correndo" — com a tecla presa, o único
  // jeito de apertar de novo é soltar antes.
  const refresh = pressed || state.sprinting
  state.sprintTapLeftS = refresh
    ? config.movement.sprintDoubleTapS
    : Math.max(0, state.sprintTapLeftS - dtS)
  return secondTap
}

function drainTank(state: CharacterState, config: GameplayConfig, dtS: number): void {
  state.tacticalTankS = Math.max(0, state.tacticalTankS - dtS)
  state.tacticalRechargeDelayLeftS = config.movement.tacticalSprintRechargeDelayS
}

function refillTank(state: CharacterState, config: GameplayConfig, dtS: number): void {
  if (state.tacticalRechargeDelayLeftS > 0) {
    state.tacticalRechargeDelayLeftS = Math.max(0, state.tacticalRechargeDelayLeftS - dtS)
    return
  }
  const { tacticalSprintTankS, tacticalSprintRefillS } = config.movement
  const refilled = state.tacticalTankS + (tacticalSprintTankS / tacticalSprintRefillS) * dtS
  state.tacticalTankS = Math.min(tacticalSprintTankS, refilled)
}

/**
 * Quanto do tanque resta, de 0 a 1. É o que o indicador do visor desenha.
 *
 * ```ts
 * tacticalTankRatio(character.current, config) // 1 com o tanque cheio
 * ```
 */
export function tacticalTankRatio(state: Readonly<CharacterState>, config: GameplayConfig): number {
  return state.tacticalTankS / config.movement.tacticalSprintTankS
}
