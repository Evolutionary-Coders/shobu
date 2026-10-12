import type { GameplayConfig } from '../config/gameplayConfig.ts'
import { shippedConfig, tickDurationS, ticksFor } from '../movement/movementTestKit.ts'
import { IDLE_WEAPON_INPUT, type WeaponInput } from '../weapon/weaponInput.ts'
import type { MeleeState } from './meleeState.ts'
import { stepMelee } from './stepMelee.ts'

/**
 * Apoio dos testes do corpo a corpo, no molde do `weaponTestKit.ts`. Só os
 * testes importam isto; não é api do núcleo.
 */
export { shippedConfig, tickDurationS, ticksFor }

export const MELEE: WeaponInput = { ...IDLE_WEAPON_INPUT, melee: true }
export const SLASH: WeaponInput = { ...IDLE_WEAPON_INPUT, fire: true }
export const DASH: WeaponInput = { ...IDLE_WEAPON_INPUT, scope: true }
export const PRIMARY: WeaponInput = { ...IDLE_WEAPON_INPUT, primary: true }

export function runMelee(
  state: MeleeState,
  input: WeaponInput,
  ticks: number,
  config: GameplayConfig,
): MeleeState {
  for (let tick = 0; tick < ticks; tick += 1) {
    stepMelee(state, input, true, config, tickDurationS(config))
  }
  return state
}

/** Aperta a tecla por `heldS` e solta num tick: o toque ou a pegada. */
export function pressFor(state: MeleeState, heldS: number, config: GameplayConfig): MeleeState {
  runMelee(state, MELEE, ticksFor(heldS, config), config)
  return runMelee(state, IDLE_WEAPON_INPUT, 1, config)
}
