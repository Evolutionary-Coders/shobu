import { describe, expect, it } from 'vitest'
import { createFrameStats } from './frameMeter.ts'
import { describePerfSample, gpuFrameMs, type PerfSample, perfLogRecord } from './perfSample.ts'

const SAMPLE: PerfSample = {
  frame: {
    ...createFrameStats(),
    frames: 240,
    fps: 143.94,
    meanMs: 6.947,
    medianMs: 6.9,
    p95Ms: 8.1,
    p99Ms: 12.34,
    worstMs: 41.2,
    hitches: 3,
  },
  simulation: { ...createFrameStats(), meanMs: 0.4211, p99Ms: 1.237 },
  drawCalls: 412,
  activeMeshes: 380,
  activeMeshesEvalMs: 1.234,
  cpuFrameMs: 5.678,
  gpuMs: null,
  gpu: 'ANGLE (Intel)',
}

describe('describePerfSample', () => {
  it('mostra FPS, cauda, travadas, simulação, cena e gpu', () => {
    expect(describePerfSample(SAMPLE)).toEqual([
      'FPS 143.9   6.9 ms méd   6.9 ms mediana',
      'p95 8.1   p99 12.3   pior 41.2 ms   travadas 3/240',
      'simulação 0.42 ms méd   p99 1.24 ms',
      'draw calls 412   active meshes 380   avaliação 1.23 ms',
      'cpu do quadro 5.68 ms',
      'gpu —   ANGLE (Intel)',
    ])
  })

  it('com o tempo de gpu disponível, mostra em ms', () => {
    expect(describePerfSample({ ...SAMPLE, gpuMs: 3.456 })[5]).toBe('gpu 3.46 ms   ANGLE (Intel)')
  })
})

describe('gpuFrameMs', () => {
  it('converte nanossegundos, e sem timer é null', () => {
    expect(gpuFrameMs(4_200_000)).toBe(4.2)
    expect(gpuFrameMs(0)).toBeNull()
  })
})

describe('perfLogRecord', () => {
  it('é o evento perf-sample com os números em duas casas', () => {
    expect(perfLogRecord(SAMPLE)).toMatchObject({
      event: 'perf-sample',
      fps: 143.94,
      p99Ms: 12.34,
      simMeanMs: 0.42,
      gpuMs: null,
      gpu: 'ANGLE (Intel)',
    })
  })

  it('o tempo de gpu presente também é arredondado', () => {
    expect(perfLogRecord({ ...SAMPLE, gpuMs: 3.456 }).gpuMs).toBe(3.46)
  })
})
