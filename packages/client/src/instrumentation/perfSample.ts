import type { FrameStats } from './frameMeter.ts'

/**
 * Uma amostra de desempenho: o que o overlay de debug mostra e o que o log
 * `perf-sample` grava. Dado puro, montado pelo adapter
 * (`renderer/framePerf.ts`) a partir do medidor e da instrumentação do
 * babylon.
 */
export interface PerfSample {
  readonly frame: Readonly<FrameStats>
  /** Tempo de `session.advance` por quadro que rodou tick, em ms. */
  readonly simulation: Readonly<FrameStats>
  readonly drawCalls: number
  readonly activeMeshes: number
  /** "Active meshes evaluation", a média do último segundo, em ms. */
  readonly activeMeshesEvalMs: number
  /** Tempo de cpu do `scene.render()` inteiro, média do último segundo, em ms. */
  readonly cpuFrameMs: number
  /** Tempo de gpu por quadro, em ms; `null` sem `EXT_disjoint_timer_query`. */
  readonly gpuMs: number | null
  /** O `UNMASKED_RENDERER_WEBGL`: qual gpu está desenhando. */
  readonly gpu: string
}

/**
 * As linhas do overlay, já formatadas. Ms com uma casa: abaixo disso é ruído
 * de relógio do navegador, que arredonda `performance.now()`.
 *
 * ```ts
 * describePerfSample(sample) // ['FPS 143.9   12.0 ms (méd)', ...]
 * ```
 */
export function describePerfSample(sample: PerfSample): readonly string[] {
  const { frame, simulation } = sample
  return [
    `FPS ${frame.fps.toFixed(1)}   ${frame.meanMs.toFixed(1)} ms méd   ${frame.medianMs.toFixed(1)} ms mediana`,
    `p95 ${frame.p95Ms.toFixed(1)}   p99 ${frame.p99Ms.toFixed(1)}   pior ${frame.worstMs.toFixed(1)} ms   travadas ${frame.hitches}/${frame.frames}`,
    `simulação ${simulation.meanMs.toFixed(2)} ms méd   p99 ${simulation.p99Ms.toFixed(2)} ms`,
    `draw calls ${sample.drawCalls}   active meshes ${sample.activeMeshes}   avaliação ${sample.activeMeshesEvalMs.toFixed(2)} ms`,
    `cpu do quadro ${sample.cpuFrameMs.toFixed(2)} ms`,
    `gpu ${sample.gpuMs === null ? '—' : `${sample.gpuMs.toFixed(2)} ms`}   ${sample.gpu}`,
  ]
}

/**
 * O registro do log estruturado (CLAUDE.md: json para observabilidade). Os
 * números arredondados em duas casas, para o log ficar legível sem perder o
 * que importa.
 *
 * ```ts
 * console.info(JSON.stringify(perfLogRecord(sample)))
 * ```
 */
export function perfLogRecord(sample: PerfSample): Record<string, number | string | null> {
  const round = (value: number): number => Math.round(value * 100) / 100
  return {
    event: 'perf-sample',
    fps: round(sample.frame.fps),
    meanMs: round(sample.frame.meanMs),
    medianMs: round(sample.frame.medianMs),
    p95Ms: round(sample.frame.p95Ms),
    p99Ms: round(sample.frame.p99Ms),
    worstMs: round(sample.frame.worstMs),
    hitches: sample.frame.hitches,
    frames: sample.frame.frames,
    simMeanMs: round(sample.simulation.meanMs),
    simP99Ms: round(sample.simulation.p99Ms),
    drawCalls: sample.drawCalls,
    activeMeshes: sample.activeMeshes,
    activeMeshesEvalMs: round(sample.activeMeshesEvalMs),
    cpuFrameMs: round(sample.cpuFrameMs),
    gpuMs: sample.gpuMs === null ? null : round(sample.gpuMs),
    gpu: sample.gpu,
  }
}
