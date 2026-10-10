/**
 * O jogador pediu menos movimento no sistema: balanço de câmera, coice e a
 * lente do jack-in são o gatilho vestibular clássico, e cada um deles
 * pergunta aqui.
 *
 * ```ts
 * const viewBob = createViewBob(!prefersReducedMotion())
 * ```
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
