import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { WeaponInput } from './weaponInput.ts'
import { isReloading, type WeaponState } from './weaponState.ts'

/**
 * Um tick da sniper: entrada → estado. Espelha `stepCharacter` de propósito —
 * muta no lugar, não aloca, não tem relógio nem sorteio dentro — porque é o
 * outro módulo que o cliente prediz e o servidor autoriza (ADR 0003).
 *
 * **A ordem é a parte que importa**, pelo mesmo motivo que a de `stepCharacter`
 * importa: é ambiguidade que faria cliente e servidor divergirem em silêncio.
 * O resultado do tiro é limpo **antes** de qualquer coisa poder marcá-lo, os
 * cronômetros correm antes da tentativa de disparo, e as bordas de botão são
 * lembradas por último.
 *
 * As regras, e por que cada uma:
 * - **semiautomático por borda**: segurar o botão não repete. É ferrolho.
 * - **ferrolho em curso recusa o tiro**: é o único custo de errar (GDD).
 * - **pente vazio começa a recarga** em vez de clique morto, e esvaziar o
 *   pente começa a recarga sozinho: "munição não é recurso a gerenciar".
 * - **atirar com bala no pente cancela a recarga**: recarregar cedo não pode
 *   ser punido, já que munição não é recurso.
 * - **o disparo fecha a mira**, e como abrir é por borda, o botão direito
 *   preso não reabre. É o que faz "atirar fecha o scope" ser observável.
 *
 * ```ts
 * stepWeapon(weapon, { fire: true, scope: false, reload: false }, config, 1 / 60)
 * ```
 */
export function stepWeapon(
  state: WeaponState,
  input: WeaponInput,
  config: GameplayConfig,
  dtS: number,
): void {
  assertTickDuration(dtS)
  const firePressed = input.fire && !state.fireWasHeld
  const scopePressed = input.scope && !state.scopeWasHeld
  const reloadPressed = input.reload && !state.reloadWasHeld
  state.firedThisTick = false
  tickTimers(state, config, dtS)
  updateScope(state, input, scopePressed, dtS)
  if (firePressed) tryFire(state, config)
  if (reloadPressed) tryReload(state, config)
  rememberHeldButtons(state, input)
}

/** A recarga enche o pente **de uma vez**, no tick em que termina. */
function tickTimers(state: WeaponState, config: GameplayConfig, dtS: number): void {
  if (state.boltLeftS > 0) state.boltLeftS = Math.max(0, state.boltLeftS - dtS)
  if (state.reloadLeftS <= 0) return
  state.reloadLeftS = Math.max(0, state.reloadLeftS - dtS)
  if (state.reloadLeftS === 0) state.roundsInMagazine = config.weapon.magazineRounds
}

function updateScope(
  state: WeaponState,
  input: WeaponInput,
  scopePressed: boolean,
  dtS: number,
): void {
  if (scopePressed) {
    state.scoped = true
    state.scopedForS = 0
    return
  }
  if (!input.scope) {
    state.scoped = false
    state.scopedForS = 0
    return
  }
  if (state.scoped) state.scopedForS += dtS
}

function tryFire(state: WeaponState, config: GameplayConfig): void {
  if (state.boltLeftS > 0) return
  if (state.roundsInMagazine <= 0) {
    // recomeçar a recarga a cada clique no vazio deixaria o jogador estender a
    // própria recarga para sempre, batendo no gatilho por nervosismo.
    if (!isReloading(state)) startReload(state, config)
    return
  }
  state.reloadLeftS = 0
  state.roundsInMagazine -= 1
  state.boltLeftS = config.weapon.boltCycleS
  state.shotsFired += 1
  state.firedThisTick = true
  state.scoped = false
  state.scopedForS = 0
  if (state.roundsInMagazine === 0) startReload(state, config)
}

/** A recarga engole o ferrolho: ela dura mais, e ciclar por dentro dela não ganha nada. */
function startReload(state: WeaponState, config: GameplayConfig): void {
  state.reloadLeftS = config.weapon.reloadS
  state.boltLeftS = 0
}

function tryReload(state: WeaponState, config: GameplayConfig): void {
  if (isReloading(state)) return
  if (state.roundsInMagazine >= config.weapon.magazineRounds) return
  startReload(state, config)
}

function rememberHeldButtons(state: WeaponState, input: WeaponInput): void {
  state.fireWasHeld = input.fire
  state.scopeWasHeld = input.scope
  state.reloadWasHeld = input.reload
}

function assertTickDuration(dtS: number): void {
  if (!Number.isFinite(dtS) || dtS <= 0) {
    throw new RangeError(`dtS recebeu ${dtS}; esperado duração de tick finita > 0`)
  }
}
