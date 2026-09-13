/**
 * Quanto de um decaimento exponencial cabe num quadro de `dtS`.
 *
 * `1 - e^(-k·dt)` e não `min(1, k·dt)`. A aproximação linear tem dois defeitos,
 * e os dois aparecem em movimento:
 *
 * - **depende da taxa de quadros**: o tempo de quadro varia de 13 a 21 ms num
 *   monitor de 60 Hz, e ela transforma essa variação em variação da resposta —
 *   o ruído do relógio vira tremor na tela.
 * - **satura**: com `dt > 1/k` ela vale 1 e o valor perseguido salta de uma vez
 *   para o alvo, então uma engasgada de quadro **teleporta** em vez de mover.
 *
 * Mora sozinha porque é usada por tudo que persegue um alvo ao longo do tempo:
 * o balanço da arma, o coice e o que vier.
 */
export function followFraction(dtS: number, perSecond: number): number {
  return 1 - Math.exp(-perSecond * dtS)
}
