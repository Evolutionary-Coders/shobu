/**
 * As cores do visor para quem não lê css: o visor do óculos é desenhado num
 * canvas, e canvas não enxerga `var(--hud-red)`. A fonte de verdade continua
 * sendo o `arenaTheme.css` — este espelho existe porque o óculos precisa dos
 * valores, e o teste falha no dia em que os dois divergirem (ADR 0013).
 *
 * ```ts
 * ctx.fillStyle = VISOR_PALETTE.red
 * ```
 */
export const VISOR_PALETTE = {
  red: '#ff2a3c',
  redDim: '#8f1d2b',
  yellow: '#ffd23c',
  orange: '#ff8a1e',
  white: '#f4f4f0',
  grey: '#a7a9ae',
  greyDim: '#5d6068',
  ink: '#07080b',
} as const

export type VisorColor = (typeof VISOR_PALETTE)[keyof typeof VISOR_PALETTE]
