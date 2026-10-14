/**
 * O medidor de quadros: quanto cada quadro levou, numa janela deslizante, e
 * o que isso diz da fluidez. Dado puro — quem alimenta é o adapter do babylon
 * (`renderer/framePerf.ts`), com o intervalo entre um quadro e o seguinte.
 *
 * Média e FPS sozinhos escondem o que o jogador sente: 60 FPS de média com um
 * quadro de 120 ms a cada segundo é jogo "lagado". Por isso o medidor dá a
 * cauda (p95, p99, pior quadro) e conta as **travadas**.
 */

/** Quadros na janela: ~4 s a 60 Hz, ~1,7 s a 144 Hz. */
export const FRAME_WINDOW = 240

/**
 * Uma travada é um quadro mais longo que este múltiplo da mediana da janela.
 * Relativo, e não um número fixo de ms: 25 ms é travada num monitor de 144 Hz
 * e quadro normal num de 30.
 */
export const HITCH_FACTOR = 2

export interface FrameStats {
  /** Quadros na janela agora; menor que `FRAME_WINDOW` até ela encher. */
  frames: number
  fps: number
  meanMs: number
  /** A mediana: é o ritmo do monitor quando o jogo acompanha (vsync). */
  medianMs: number
  /**
   * O quadro mais rápido da janela. Com vsync os quadros são múltiplos da
   * varredura, e mesmo um jogo que perde metade dos quadros tem alguns na
   * varredura exata: é a melhor estimativa do intervalo do monitor.
   */
  fastestMs: number
  p95Ms: number
  p99Ms: number
  worstMs: number
  /** Quadros da janela acima de `HITCH_FACTOR` × mediana. */
  hitches: number
}

export interface FrameMeter {
  /** Um quadro, em ms. Não aloca: é chamado todo quadro. */
  push(frameMs: number): void
  /** As estatísticas da janela, escritas em `into`. Ordena uma cópia: chame ~1×/s, não todo quadro. */
  stats(into: FrameStats): FrameStats
  reset(): void
}

export function createFrameStats(): FrameStats {
  return {
    frames: 0,
    fps: 0,
    meanMs: 0,
    medianMs: 0,
    fastestMs: 0,
    p95Ms: 0,
    p99Ms: 0,
    worstMs: 0,
    hitches: 0,
  }
}

/**
 * ```ts
 * const meter = createFrameMeter()
 * scene.onAfterRenderObservable.add(() => meter.push(engine.getDeltaTime()))
 * meter.stats(stats).fps // 143.8
 * ```
 */
export function createFrameMeter(windowSize = FRAME_WINDOW): FrameMeter {
  if (!Number.isInteger(windowSize) || windowSize < 1) {
    throw new RangeError(`windowSize recebeu ${windowSize}; esperado inteiro >= 1`)
  }
  const ring = new Float64Array(windowSize)
  const sorted = new Float64Array(windowSize)
  const state = { next: 0, count: 0 }
  return {
    push: (frameMs) => {
      if (!(frameMs > 0) || !Number.isFinite(frameMs)) return
      ring[state.next] = frameMs
      state.next = (state.next + 1) % windowSize
      state.count = Math.min(state.count + 1, windowSize)
    },
    stats: (into) => windowStats(ring, sorted, state.count, into),
    reset: () => {
      state.next = 0
      state.count = 0
    },
  }
}

function windowStats(
  ring: Float64Array,
  sorted: Float64Array,
  count: number,
  into: FrameStats,
): FrameStats {
  if (count === 0) return Object.assign(into, createFrameStats())
  const frames = sorted.subarray(0, count)
  frames.set(ring.subarray(0, count))
  frames.sort()
  const total = frames.reduce((sum, ms) => sum + ms, 0)
  const medianMs = percentile(frames, 0.5)
  into.frames = count
  into.meanMs = total / count
  into.fps = 1000 / into.meanMs
  into.medianMs = medianMs
  into.fastestMs = frames[0] as number
  into.p95Ms = percentile(frames, 0.95)
  into.p99Ms = percentile(frames, 0.99)
  // `as` e não `?? 0`: `count` > 0 aqui, então o índice sempre existe, e a
  // saída de reserva seria um ramo que teste nenhum alcança.
  into.worstMs = frames[count - 1] as number
  into.hitches = countAbove(frames, medianMs * HITCH_FACTOR)
  return into
}

/** Pelo vizinho mais próximo, sem interpolar: o p99 de 100 quadros é um quadro de verdade. */
function percentile(sorted: Float64Array, fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)
  return sorted[Math.max(0, index)] as number
}

function countAbove(sorted: Float64Array, limit: number): number {
  let hitches = 0
  for (const ms of sorted) if (ms > limit) hitches += 1
  return hitches
}
