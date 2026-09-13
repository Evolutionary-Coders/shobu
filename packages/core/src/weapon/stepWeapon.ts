import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { WeaponInput } from './weaponInput.ts'
import { isExactShot, isReloading, type WeaponState } from './weaponState.ts'

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
 * - **a mira é um interruptor, não um botão preso**: um clique abre, outro
 *   fecha, e o disparo fecha. Segurar o botão direito o jogo inteiro seria a
 *   alternativa, e num sniper de ferrolho, em que a mira fica aberta entre
 *   tiros, isso é um dedo travado por partida.
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
  updateScope(state, scopePressed, dtS)
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

/**
 * Interruptor: a borda de descida do botão direito inverte o estado. Soltar o
 * botão não fecha nada — quem fecha é outro clique, ou o disparo.
 */
function updateScope(state: WeaponState, scopePressed: boolean, dtS: number): void {
  if (scopePressed) {
    state.scoped = !state.scoped
    state.scopedForS = 0
    return
  }
  if (state.scoped) state.scopedForS += dtS
}

function tryFire(state: WeaponState, config: GameplayConfig): void {
  if (state.boltLeftS > 0) return
  // pente vazio é sempre pente recarregando: esvaziar já começa a recarga no
  // fim desta função, e só a recarga reenche. então clicar no vazio não tem o
  // que começar — e, por não ter, também não estende a recarga de quem bate no
  // gatilho por nervosismo.
  if (state.roundsInMagazine <= 0) return
  state.reloadLeftS = 0
  state.roundsInMagazine -= 1
  state.boltLeftS = config.weapon.boltCycleS
  state.shotsFired += 1
  state.firedThisTick = true
  // guardar antes de fechar a mira: o tiro é resolvido depois deste tick, e
  // lá `scoped` já é falso.
  state.firedScoped = state.scoped
  state.firedExact = isExactShot(state, config)
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
