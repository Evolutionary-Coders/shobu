import type { GameplayConfig } from '../config/gameplayConfig.ts'
import { shippedConfig, tickDurationS } from '../movement/movementTestKit.ts'
import { stepWeapon } from './stepWeapon.ts'
import { IDLE_WEAPON_INPUT, type WeaponInput } from './weaponInput.ts'
import { createWeaponState, type WeaponState } from './weaponState.ts'

/**
 * Apoio dos testes da arma, no molde do `movementTestKit.ts`: a config
 * **versionada**, e um jeito de avançar N ticks com a mesma entrada. Só os
 * testes importam isto; não é api do núcleo.
 */
export { shippedConfig, tickDurationS }

export const FIRE: WeaponInput = { ...IDLE_WEAPON_INPUT, fire: true }
export const SCOPE: WeaponInput = { ...IDLE_WEAPON_INPUT, scope: true }
export const RELOAD: WeaponInput = { ...IDLE_WEAPON_INPUT, reload: true }

export function armedWeapon(config: GameplayConfig): WeaponState {
  return createWeaponState(config)
}

export function runTicks(
  state: WeaponState,
  input: WeaponInput,
  config: GameplayConfig,
  ticks: number,
): WeaponState {
  for (let tick = 0; tick < ticks; tick += 1) {
    stepWeapon(state, input, config, tickDurationS(config))
  }
  return state
}

export function ticksFor(seconds: number, config: GameplayConfig): number {
  return Math.ceil(seconds / tickDurationS(config))
}

/** Um toque completo do botão: aperta num tick, solta no seguinte. */
export function tapButton(
  state: WeaponState,
  input: WeaponInput,
  config: GameplayConfig,
): WeaponState {
  stepWeapon(state, input, config, tickDurationS(config))
  stepWeapon(state, IDLE_WEAPON_INPUT, config, tickDurationS(config))
  return state
}
