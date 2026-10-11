import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { WeaponInput } from '../weapon/weaponInput.ts'
import type { MeleeState, MeleeStrikeKind } from './meleeState.ts'

/**
 * Um tick do corpo a corpo: entrada → estado, no molde do `stepWeapon` — muta
 * no lugar, não aloca, sem relógio nem sorteio (ADR 0003). Quem resolve **em
 * quem** o golpe pegou é `resolveMeleeStrike`, depois, como o tiro.
 *
 * A regra da tecla (ADR 0021):
 * - **faca na classe**: apertar é golpe rápido, na descida. É o "golpe
 *   instantâneo" do gdd, e segurar não faz mais nada.
 * - **katana na classe**: soltar antes de `holdToDrawS` é golpe rápido;
 *   segurar até lá empunha a katana — e, com ela na mão, guarda. O golpe sai
 *   na **soltura** e não na descida porque só ali se sabe que foi toque.
 * - **com a katana na mão**: tiro é corte, mira é investida (só no chão), e
 *   a tecla 1 ou a roda voltam à sniper. Tocar a tecla também corta.
 *
 * ```ts
 * stepMelee(melee, input, body.grounded, config, 1 / 60)
 * ```
 */
export function stepMelee(
  state: MeleeState,
  input: WeaponInput,
  grounded: boolean,
  config: GameplayConfig,
  dtS: number,
): void {
  state.struckThisTick = false
  state.dashedThisTick = false
  tickMeleeTimers(state, dtS)
  const pressed = input.melee && !state.meleeWasHeld
  if (state.weapon === 'knife') {
    if (pressed) strike(state, 'quick', config)
  } else readKatanaKey(state, input.melee, pressed, config, dtS)
  if (state.bladeDrawn) useBlade(state, input, grounded, config)
  rememberHeld(state, input)
}

function tickMeleeTimers(state: MeleeState, dtS: number): void {
  state.drawLeftS = Math.max(0, state.drawLeftS - dtS)
  state.cooldownLeftS = Math.max(0, state.cooldownLeftS - dtS)
  state.dashCooldownLeftS = Math.max(0, state.dashCooldownLeftS - dtS)
}

/** Conta o aperto: segurado até o limiar alterna a katana; solto antes, golpeia. */
function readKatanaKey(
  state: MeleeState,
  held: boolean,
  pressed: boolean,
  config: GameplayConfig,
  dtS: number,
): void {
  if (pressed) {
    state.heldS = 0
    state.holdSpent = false
  }
  if (held) {
    holdKey(state, config, dtS)
    return
  }
  if (state.meleeWasHeld && !state.holdSpent) {
    strike(state, state.bladeDrawn ? 'slash' : 'quick', config)
  }
}

/** A tecla presa conta, e no limiar alterna a katana — uma vez por aperto. */
function holdKey(state: MeleeState, config: GameplayConfig, dtS: number): void {
  state.heldS += dtS
  if (state.holdSpent || state.heldS < config.melee.holdToDrawS) return
  state.holdSpent = true
  toggleBlade(state, config)
}

function toggleBlade(state: MeleeState, config: GameplayConfig): void {
  state.bladeDrawn = !state.bladeDrawn
  state.drawLeftS = state.bladeDrawn ? config.melee.katanaDrawS : 0
}

/** Os botões da sniper, com a katana na mão: corte, investida e volta à sniper. */
function useBlade(
  state: MeleeState,
  input: WeaponInput,
  grounded: boolean,
  config: GameplayConfig,
): void {
  if (input.fire && !state.fireWasHeld) strike(state, 'slash', config)
  if (input.scope && !state.scopeWasHeld && grounded) dash(state, config)
  if (input.primary && !state.primaryWasHeld) state.bladeDrawn = false
}

/**
 * Golpe recusado em recarga e durante o saque: sacar não é atacar, e é o que
 * impede empunhar e cortar no mesmo tick.
 */
function strike(state: MeleeState, kind: MeleeStrikeKind, config: GameplayConfig): void {
  if (state.cooldownLeftS > 0 || state.drawLeftS > 0) return
  state.cooldownLeftS = cooldownFor(state, kind, config)
  state.struckThisTick = true
  state.strikeKind = kind
  state.strikes += 1
}

function cooldownFor(state: MeleeState, kind: MeleeStrikeKind, config: GameplayConfig): number {
  const { melee } = config
  if (state.weapon === 'knife') return melee.knifeCooldownS
  return kind === 'slash' ? melee.katanaSlashCooldownS : melee.katanaQuickCooldownS
}

function dash(state: MeleeState, config: GameplayConfig): void {
  if (state.dashCooldownLeftS > 0 || state.drawLeftS > 0) return
  state.dashCooldownLeftS = config.melee.dashCooldownS
  state.dashedThisTick = true
}

function rememberHeld(state: MeleeState, input: WeaponInput): void {
  state.meleeWasHeld = input.melee
  state.fireWasHeld = input.fire
  state.scopeWasHeld = input.scope
  state.primaryWasHeld = input.primary
}
