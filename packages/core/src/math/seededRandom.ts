/**
 * O gerador pseudoaleatório do núcleo. Congruencial linear sobre `Math.imul`:
 * aritmética de inteiro de 32 bits, exata em toda plataforma, que é o que a
 * ADR 0003 exige de tudo que o servidor precisa reproduzir.
 *
 * `Math.random` não serve e é proibido aqui — a dispersão do tiro tem que sair
 * igual no cliente e no servidor a partir da mesma semente, senão o cliente vê
 * um acerto que o servidor recusa, que é o defeito que derruba a demo (nfr.md).
 *
 * As constantes são as de Numerical Recipes, as mesmas que o `replay.test.ts`
 * já usava para sortear roteiro — promovidas de teste a núcleo para cliente e
 * servidor compartilharem um gerador só.
 */
export interface SeededRandom {
  state: number
}

const MULTIPLIER = 1_664_525
const INCREMENT = 1_013_904_223

/** Divisor que leva o inteiro de 32 bits sem sinal para [0, 1). */
const UNSIGNED_32 = 4_294_967_296

export function createSeededRandom(seed: number): SeededRandom {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`seed recebeu ${seed}; esperado número finito`)
  }
  return { state: seed | 0 }
}

/**
 * Próximo número em [0, 1).
 *
 * ```ts
 * const rng = createSeededRandom(7)
 * nextUnit(rng) // sempre o mesmo número, em qualquer máquina
 * ```
 */
export function nextUnit(rng: SeededRandom): number {
  rng.state = (Math.imul(rng.state, MULTIPLIER) + INCREMENT) | 0
  return (rng.state >>> 0) / UNSIGNED_32
}
