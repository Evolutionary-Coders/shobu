import { createSeededRandom, type SeededRandom } from '../math/seededRandom.ts'

/**
 * A semente base da dispersão. O cone do tiro sem mira é sorteado, e cliente e
 * servidor precisam sortear a mesma direção: a semente de cada tiro é esta base
 * combinada com o contador de tiros da arma, que anda igual nos dois lados.
 */
export const SHOT_SEED_BASE = 20_251_119

/**
 * ```ts
 * resolveShot(origin, boxes, targets, shotRandom(weapon.shotsFired), hit)
 * ```
 */
export function shotRandom(shotsFired: number, seedBase: number = SHOT_SEED_BASE): SeededRandom {
  return createSeededRandom(seedBase ^ shotsFired)
}
