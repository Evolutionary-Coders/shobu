import type { GameplayConfig } from '../config/gameplayConfig.ts'

/**
 * O estado da sniper. Mora fora do `CharacterState` de propósito: a regra do
 * GDD de que **o ferrolho não trava a movimentação** fica estruturalmente
 * verdadeira quando `stepWeapon` não tem acesso ao corpo do jogador.
 */
export interface WeaponState {
  roundsInMagazine: number
  /** Ferrolho em curso. Acima de zero recusa o disparo, e não afeta mais nada. */
  boltLeftS: number
  reloadLeftS: number
  scoped: boolean
  /** Há quanto tempo a mira está aberta. É o que `weapon.scopeSettleS` compara. */
  scopedForS: number
  /**
   * Resultado **deste** tick: houve disparo. Campo e não retorno, porque
   * retornar um objeto por tick alocaria — é o mesmo desenho do `grounded`,
   * que também é resultado de um tick lido pelo seguinte.
   */
  firedThisTick: boolean
  /** Contador monotônico. É a identidade do tiro: semeia a dispersão e nomeia o rastro. */
  shotsFired: number
  /**
   * A mira estava aberta **no instante do disparo**.
   *
   * Precisa existir porque o próprio disparo fecha a mira: quem resolver o
   * tiro depois de `stepWeapon` leria `scoped` já falso e trataria todo tiro
   * com luneta como no scope. É o mesmo motivo de `firedThisTick` existir —
   * resultado do tick, lido por quem vem depois dele.
   */
  firedScoped: boolean
  /** O disparo saiu exato: com a mira aberta e assentada. Mesma razão de `firedScoped`. */
  firedExact: boolean
  fireWasHeld: boolean
  scopeWasHeld: boolean
  reloadWasHeld: boolean
  /**
   * Quanto falta para a arma subir à mira: a corrida a abaixa e a katana a
   * guarda (ADR 0021). Acima de zero, o tiro e a mira pedidos **esperam** em
   * `fireQueued`/`scopeQueued` em vez de sumir — é o sprint-to-fire.
   */
  readyLeftS: number
  fireQueued: boolean
  scopeQueued: boolean
  /** A sniper guardada, com a katana na mão: não atira nem mira, e a recarga segue no coldre. */
  holstered: boolean
}

/** O que a arma está fazendo agora. É o que o viewmodel e o hud consomem. */
export type WeaponPhase = 'ready' | 'firing' | 'cycling' | 'reloading'

export function createWeaponState(config: GameplayConfig): WeaponState {
  return {
    roundsInMagazine: config.weapon.magazineRounds,
    boltLeftS: 0,
    reloadLeftS: 0,
    scoped: false,
    scopedForS: 0,
    firedThisTick: false,
    shotsFired: 0,
    firedScoped: false,
    firedExact: false,
    fireWasHeld: false,
    scopeWasHeld: false,
    reloadWasHeld: false,
    readyLeftS: 0,
    fireQueued: false,
    scopeQueued: false,
    holstered: false,
  }
}

export function copyWeaponState(from: Readonly<WeaponState>, into: WeaponState): WeaponState {
  into.roundsInMagazine = from.roundsInMagazine
  into.boltLeftS = from.boltLeftS
  into.reloadLeftS = from.reloadLeftS
  into.scoped = from.scoped
  into.scopedForS = from.scopedForS
  into.firedThisTick = from.firedThisTick
  into.shotsFired = from.shotsFired
  into.firedScoped = from.firedScoped
  into.firedExact = from.firedExact
  into.fireWasHeld = from.fireWasHeld
  into.scopeWasHeld = from.scopeWasHeld
  into.reloadWasHeld = from.reloadWasHeld
  into.readyLeftS = from.readyLeftS
  into.fireQueued = from.fireQueued
  into.scopeQueued = from.scopeQueued
  into.holstered = from.holstered
  return into
}

/**
 * A arma de quem reaparece: pente cheio, luneta fechada, sem recarga nem
 * ferrolho pela metade. Quem morreu de luneta aberta voltava ao spawn mirando
 * (revisão do PR #16).
 *
 * O `shotsFired` **sobrevive**: é a identidade do tiro, e recomeçá-lo
 * repetiria a semente de dispersão de tiros que já aconteceram.
 *
 * ```ts
 * rearmWeapon(session.weapon, config)
 * ```
 */
export function rearmWeapon(state: WeaponState, config: GameplayConfig): WeaponState {
  const shotsFired = state.shotsFired
  copyWeaponState(createWeaponState(config), state)
  state.shotsFired = shotsFired
  return state
}

/**
 * A arma está pedindo para o corpo **não** correr: com a mira aberta, ou com
 * um tiro ou uma mira esperando a arma subir. É o "atirar sai da corrida" do
 * sprint-to-fire — sem isto, o tiro pedido correndo esperaria para sempre.
 *
 * ```ts
 * movementInput.sprint = keys.sprint && !weaponHoldsSprint(weapon)
 * ```
 */
export function weaponHoldsSprint(state: Readonly<WeaponState>): boolean {
  return state.scoped || state.fireQueued || state.scopeQueued
}

export function isReloading(state: Readonly<WeaponState>): boolean {
  return state.reloadLeftS > 0
}

export function canFire(state: Readonly<WeaponState>): boolean {
  return state.boltLeftS <= 0 && state.roundsInMagazine > 0
}

/**
 * O disparo é exato com a mira aberta, passado o tempo de assentamento.
 *
 * São **dois relógios**: este, que decide a precisão, e o
 * `camera.scopeTransitionS` do render, que decide o zoom. `scopeSettleS` é
 * menor, e é isso que faz o quick scope do modelo de simulação existir — a
 * precisão total chega antes de o zoom terminar.
 */
export function isExactShot(state: Readonly<WeaponState>, config: GameplayConfig): boolean {
  return state.scoped && state.scopedForS >= config.weapon.scopeSettleS
}

/**
 * ```ts
 * weaponPhase(state) // 'cycling' logo depois de um tiro
 * ```
 */
export function weaponPhase(state: Readonly<WeaponState>): WeaponPhase {
  if (state.firedThisTick) return 'firing'
  if (state.reloadLeftS > 0) return 'reloading'
  if (state.boltLeftS > 0) return 'cycling'
  return 'ready'
}
