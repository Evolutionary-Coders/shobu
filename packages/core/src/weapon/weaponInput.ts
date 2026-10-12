/**
 * O que o jogador pede da arma num tick. Como o `MovementInput`, é o dado que
 * a rede transporta (ADR 0002): botão **preso**, nunca evento, porque o núcleo
 * roda em tick fixo e lê a borda contra o tick anterior. Evento perdido na rede
 * é tiro que não sai; botão preso reconcilia sozinho.
 */
export interface WeaponInput {
  readonly fire: boolean
  /** A mira de **interruptor** (botão direito, toque): cada aperto abre ou fecha. */
  readonly scope: boolean
  /**
   * A mira de **segurar** (LT/L2/L1 do controle): aberta enquanto presa, fecha ao
   * soltar. Convive com `scope` — o mouse alterna e o controle segura, e o
   * núcleo não precisa saber de qual dispositivo veio cada um.
   */
  readonly aim: boolean
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
  aim: false,
  reload: false,
  melee: false,
  primary: false,
}
