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

/**
 * O estado inicial é **embaralhado**, não a semente crua.
 *
 * Um congruencial linear começado em sementes vizinhas devolve primeiras
 * tiradas vizinhas: `state` vira `seed * A + C`, e dois `seed` consecutivos dão
 * dois `state` a uma distância fixa. O jogo semeia cada tiro pelo contador de
 * tiros, ou seja, exatamente com sementes consecutivas — sem o embaralhamento,
 * tiros seguidos desviariam para lados correlacionados, e a dispersão deixaria
 * de ser uniforme na prática mesmo sendo uniforme na teoria.
 *
 * O embaralhamento é o finalizador do murmur3, em `Math.imul`: inteiro de 32
 * bits, exato em toda plataforma.
 */
export function createSeededRandom(seed: number): SeededRandom {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`seed recebeu ${seed}; esperado número finito`)
  }
  return { state: scramble(seed | 0) }
}

function scramble(seed: number): number {
  let state = seed ^ 0x9e37_79b9
  state = Math.imul(state ^ (state >>> 16), 0x85eb_ca6b)
  state = Math.imul(state ^ (state >>> 13), 0xc2b2_ae35)
  return (state ^ (state >>> 16)) | 0
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
