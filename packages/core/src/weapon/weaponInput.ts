/**
 * O que o jogador pede da arma num tick. Como o `MovementInput`, é o dado que
 * a rede transporta (ADR 0002): botão **preso**, nunca evento, porque o núcleo
 * roda em tick fixo e lê a borda contra o tick anterior. Evento perdido na rede
 * é tiro que não sai; botão preso reconcilia sozinho.
 */
export interface WeaponInput {
  readonly fire: boolean
  readonly scope: boolean
  readonly reload: boolean
  /**
   * A tecla do corpo a corpo (V, R3), presa. Tocar é golpe rápido; segurar
   * empunha a katana (ADR 0021). Quem separa os dois é o núcleo, contando ticks.
   */
  readonly melee: boolean
  /** Voltar à arma principal (tecla 1, roda do mouse). */
  readonly primary: boolean
}

export const IDLE_WEAPON_INPUT: WeaponInput = {
  fire: false,
  scope: false,
  reload: false,
  melee: false,
  primary: false,
}
