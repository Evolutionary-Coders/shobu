/**
 * O rodízio dos telões: o atlas de anúncios tem quatro células (2 × 2), e a
 * cada `periodS` todos os telões andam uma célula. Cada telão nasce numa
 * célula diferente e todos andam o mesmo deslocamento, então dois telões nunca
 * mostram o mesmo anúncio — é uma permutação, e não um sorteio.
 *
 * O deslocamento vai no uv da textura emissiva (com `wrap` de repetição): o
 * telão troca de anúncio sem trocar textura nem material.
 */

/** Os deslocamentos de uv, na ordem do rodízio: direita, baixo, diagonal, volta. */
export const BILLBOARD_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.5, 0],
  [0, 0.5],
  [0.5, 0.5],
]

/**
 * O passo do rodízio no instante `timeS`.
 *
 * ```ts
 * billboardStepAt(13, 6) // 2
 * ```
 */
export function billboardStepAt(timeS: number, periodS: number): number {
  if (!(periodS > 0)) {
    throw new RangeError(`periodS recebeu ${periodS}; esperado número > 0`)
  }
  return Math.floor(Math.max(0, timeS) / periodS) % BILLBOARD_OFFSETS.length
}
