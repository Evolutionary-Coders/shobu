/**
 * O modo de medição: `?perf=1` na url. Abre o overlay de desempenho desde o
 * boot, expõe a cena ao roteiro de medição e libera o `?tickHz=`. Uma leitura
 * só, para as duas portas que dependem dele não divergirem.
 *
 * ```ts
 * isPerfMode('?perf=1&tickHz=120') // true
 * ```
 */
export function isPerfMode(search: string): boolean {
  return new URLSearchParams(search).get('perf') === '1'
}

/**
 * O competidor de revisão (o boneco que imita o jogador num poste, para ver
 * os clipes de terceira pessoa) é ferramenta de quem desenvolve: só com
 * `?revisao=1`. No jogo normal ele era um personagem animado a mais — no
 * celular, cpu e lixo de animação por nada (medição de 11/10).
 *
 * ```ts
 * isReviewMode('?revisao=1') // true
 * ```
 */
export function isReviewMode(search: string): boolean {
  return new URLSearchParams(search).get('revisao') === '1'
}

/**
 * As caixas de colisão desenhadas por cima da arte, pintadas pelo que cada uma
 * para (`colliderOverlay.ts`, ADR 0024): ferramenta de revisão, só no modo de
 * medição e com `?colisao=1`.
 *
 * ```ts
 * isColliderReview('?perf=1&colisao=1') // true
 * ```
 */
export function isColliderReview(search: string): boolean {
  return isPerfMode(search) && new URLSearchParams(search).get('colisao') === '1'
}
