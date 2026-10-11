import type { FrameStats } from '../instrumentation/frameMeter.ts'

/**
 * A política do AUTO: começa em EQUILIBRADO, na escala 1, e ajusta só a
 * escala de resolução pelo tempo de quadro. Dado puro, alimentado a cada
 * amostra (~2 s) pelo adapter (`renderer/applyQuality.ts`).
 *
 * Três travas contra oscilar:
 * - **assimetria**: desce depois de 2 amostras lentas seguidas, sobe só
 *   depois de 10 rápidas — cair rápido é o que o jogador sente;
 * - **teto**: a escala que se mostrou lenta fica proibida por 30 amostras
 *   (~1 min), senão o AUTO subiria de volta e cairia de novo em ciclo;
 * - **limites**: entre 0,6 e 1. Abaixo de 0,6 o texto da arena borra demais,
 *   e acima de 1 é QUALIDADE, que o jogador escolhe.
 */
export const AUTO_SCALE_MIN = 0.6
export const AUTO_SCALE_MAX = 1
export const AUTO_SCALE_STEP = 0.1
export const SLOW_SAMPLES_TO_DROP = 2
export const FAST_SAMPLES_TO_RISE = 10
export const CEILING_SAMPLES = 30

/** Lento é o p95 passar de um quadro do monitor e um quarto; rápido, ficar dentro de um quadro. */
export const SLOW_P95_FACTOR = 1.25
export const FAST_P95_FACTOR = 1.05

export interface AutoQualityState {
  scale: number
  slowStreak: number
  fastStreak: number
  /** A escala que foi lenta, e por quantas amostras ela segue proibida. */
  ceiling: number
  ceilingLeft: number
}

export function createAutoQuality(): AutoQualityState {
  return { scale: AUTO_SCALE_MAX, slowStreak: 0, fastStreak: 0, ceiling: Infinity, ceilingLeft: 0 }
}

/**
 * Uma amostra. `refreshMs` é o intervalo do monitor — a menor mediana já
 * vista: quando o jogo acompanha o vsync, a mediana é a própria varredura.
 *
 * ```ts
 * stepAutoQuality(state, stats, 1000 / 144).scale // 0.9 depois de duas amostras lentas
 * ```
 */
export function stepAutoQuality(
  state: AutoQualityState,
  stats: Readonly<FrameStats>,
  refreshMs: number,
): AutoQualityState {
  if (stats.frames === 0 || !(refreshMs > 0)) return state
  tickCeiling(state)
  if (stats.p95Ms > refreshMs * SLOW_P95_FACTOR) return onSlow(state)
  if (stats.p95Ms <= refreshMs * FAST_P95_FACTOR) return onFast(state)
  state.slowStreak = 0
  state.fastStreak = 0
  return state
}

function tickCeiling(state: AutoQualityState): void {
  if (state.ceilingLeft === 0) return
  state.ceilingLeft -= 1
  if (state.ceilingLeft === 0) state.ceiling = Infinity
}

function onSlow(state: AutoQualityState): AutoQualityState {
  state.fastStreak = 0
  state.slowStreak += 1
  if (state.slowStreak < SLOW_SAMPLES_TO_DROP || state.scale <= AUTO_SCALE_MIN) return state
  state.ceiling = state.scale
  state.ceilingLeft = CEILING_SAMPLES
  state.scale = roundScale(Math.max(AUTO_SCALE_MIN, state.scale - AUTO_SCALE_STEP))
  state.slowStreak = 0
  return state
}

function onFast(state: AutoQualityState): AutoQualityState {
  state.slowStreak = 0
  state.fastStreak += 1
  const next = roundScale(Math.min(AUTO_SCALE_MAX, state.scale + AUTO_SCALE_STEP))
  if (state.fastStreak < FAST_SAMPLES_TO_RISE || next >= state.ceiling) return state
  state.scale = next
  state.fastStreak = 0
  return state
}

/** Uma casa: 0,1 em ponto flutuante soma 0,30000000000000004. */
function roundScale(scale: number): number {
  return Math.round(scale * 10) / 10
}
