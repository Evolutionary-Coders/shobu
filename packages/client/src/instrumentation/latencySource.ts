/**
 * De onde vem o ping do hud. Hoje não há servidor (o colyseus vem depois, ADR
 * 0002), e a fonte nula responde "não sei" — o hud mostra `PING --`, e nunca
 * um número inventado. A fonte de verdade, quando existir, mede o ida e volta
 * do canal da partida e implementa só isto.
 */
export interface LatencySource {
  /** O ida e volta mais recente, em ms; `null` sem medida. */
  latencyMs(): number | null
}

/** A fonte de quem ainda não tem servidor. */
export const NULL_LATENCY_SOURCE: LatencySource = { latencyMs: () => null }
