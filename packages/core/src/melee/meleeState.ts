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
 * o corte com a katana empunhada.
 */
export type MeleeStrikeKind = 'quick' | 'slash'

/** As armas do slot, na ordem do menu de classe. A primeira é a padrão: a katana. */
export const MELEE_WEAPONS: readonly MeleeWeapon[] = ['katana', 'knife']

export interface MeleeState {
  /** O slot da classe. Escolhido no menu, nunca muda no meio da vida. */
  weapon: MeleeWeapon
  /** A katana na mão e a sniper no coldre. */
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
    primaryWasHeld: false,
  }
}

/**
 * Quem reaparece volta com a sniper na mão (ADR 0021), sem golpe pela metade.
 * O `strikes` sobrevive pelo mesmo motivo do `shotsFired`: é identidade.
 *
 * ```ts
 * rearmMelee(session.melee)
 * ```
 */
export function rearmMelee(state: MeleeState): MeleeState {
  const { weapon, strikes } = state
  Object.assign(state, createMeleeState(weapon))
  state.strikes = strikes
  return state
}
