/**
 * O corpo a corpo de um combatente (ADR 0021): a arma do slot de corpo a corpo
 * da classe, se a katana está na mão, e os relógios dos golpes.
 *
 * Mora fora do `WeaponState` pelo mesmo motivo que a arma mora fora do corpo:
 * cada regra fica estruturalmente onde pertence, e `stepArsenal` é o único que
 * vê as duas armas juntas.
 */
export type MeleeWeapon = 'knife' | 'katana'

/**
 * `quick` é o golpe da tecla, com a sniper na mão (faca ou katana); `slash` é
 * o golpe com a lâmina empunhada — o corte da katana, a facada da faca.
 */
export type MeleeStrikeKind = 'quick' | 'slash'

/** As armas do slot, na ordem do menu de classe. A primeira é a padrão: a katana. */
export const MELEE_WEAPONS: readonly MeleeWeapon[] = ['katana', 'knife']

export interface MeleeState {
  /** O slot da classe. Escolhido no menu, nunca muda no meio da vida. */
  weapon: MeleeWeapon
  /** A lâmina (katana ou faca) na mão e a sniper no coldre. */
  bladeDrawn: boolean
  /** Sacando a katana: até zerar, ela não corta. */
  drawLeftS: number
  /** Há quanto tempo a tecla está presa neste aperto. */
  heldS: number
  /** Este aperto já empunhou ou guardou a katana: soltar não vira golpe. */
  holdSpent: boolean
  cooldownLeftS: number
  dashCooldownLeftS: number
  /** Resultado **deste** tick, como o `firedThisTick` da arma: houve golpe. */
  struckThisTick: boolean
  /** O tipo do último golpe. É o que o viewmodel escolhe animar. */
  strikeKind: MeleeStrikeKind
  /** Contador monotônico: a identidade do golpe, para a animação não repetir o mesmo. */
  strikes: number
  /** A investida saiu neste tick. Quem a aplica no corpo é `stepCharacter`, pelo `dash`. */
  dashedThisTick: boolean
  meleeWasHeld: boolean
  fireWasHeld: boolean
  scopeWasHeld: boolean
  aimWasHeld: boolean
  primaryWasHeld: boolean
}

/**
 * ```ts
 * const melee = createMeleeState('katana')
 * ```
 */
export function createMeleeState(weapon: MeleeWeapon): MeleeState {
  return {
    weapon,
    bladeDrawn: false,
    drawLeftS: 0,
    heldS: 0,
    holdSpent: false,
    cooldownLeftS: 0,
    dashCooldownLeftS: 0,
    struckThisTick: false,
    strikeKind: 'quick',
    strikes: 0,
    dashedThisTick: false,
    meleeWasHeld: false,
    fireWasHeld: false,
    scopeWasHeld: false,
    aimWasHeld: false,
    primaryWasHeld: false,
  }
}

/**
 * Quem reaparece volta com a sniper na mão (ADR 0021), sem golpe pela metade.
 * Alocar o estado novo aqui é evento de segundos, fora do caminho quente.
 * O `strikes` sobrevive pelo mesmo motivo do `shotsFired`: é identidade.
 *
 * ```ts
 * rearmMelee(session.melee)
 * ```
 */
export function rearmMelee(state: MeleeState): MeleeState {
  const { weapon, strikes, meleeWasHeld, fireWasHeld, scopeWasHeld, aimWasHeld, primaryWasHeld } =
    state
  Object.assign(state, createMeleeState(weapon))
  state.strikes = strikes
  // as teclas presas atravessam a morte: a tecla que empunhava não vira golpe
  // ao soltar, nem empunha de novo ao renascer — o aperto já foi gasto.
  Object.assign(state, { meleeWasHeld, fireWasHeld, scopeWasHeld, aimWasHeld, primaryWasHeld })
  state.holdSpent = true
  return state
}
