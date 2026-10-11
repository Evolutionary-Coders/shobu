import type { Engine } from '@babylonjs/core/Engines/engine'
// as duas extensões de consulta de tempo da gpu: sem elas, `captureGPUFrameTime` não
// existe na engine modular, e o overlay derrubava o boot (medição de 11/10).
import '@babylonjs/core/Engines/Extensions/engine.query'
import '@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery'
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation'
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation'
import type { Scene } from '@babylonjs/core/scene'
import {
  createFrameMeter,
  createFrameStats,
  type FrameMeter,
} from '../instrumentation/frameMeter.ts'
import {
  describePerfSample,
  type PerfSample,
  perfLogRecord,
} from '../instrumentation/perfSample.ts'

/** Overlay a cada meio segundo, log a cada cinco: os dois são leitura humana, não telemetria. */
const OVERLAY_EVERY_MS = 500
const LOG_EVERY_SAMPLES = 10

export interface FramePerf {
  /** O medidor de quadros: é dele que o FPS do hud lê. */
  readonly meter: FrameMeter
  /** O tempo de um `session.advance` que rodou tick, em ms. */
  recordSimulation(ms: number): void
}

/**
 * Mede o quadro sempre — o medidor é barato e o hud mostra o FPS —, e liga a
 * instrumentação cara do babylon (`SceneInstrumentation`,
 * `EngineInstrumentation`) só com o overlay de debug aberto: F3, ou `?perf=1`
 * na url. Com o overlay aberto, a amostra também vai para o log
 * (`perf-sample`) e para `window.__shobuPerf`, que é onde o roteiro de
 * medição a lê.
 *
 * ```ts
 * const perf = attachFramePerf(scene, engine, document, location.search.includes('perf=1'))
 * ```
 */
export function attachFramePerf(
  scene: Scene,
  engine: Engine,
  document: Document,
  debugOnStart: boolean,
): FramePerf {
  const meter = createFrameMeter()
  const simulation = createFrameMeter()
  scene.onAfterRenderObservable.add(() => meter.push(engine.getDeltaTime()))
  const overlay = document.querySelector<HTMLElement>('#perf-overlay')
  if (overlay) watchOverlay(overlay, { scene, engine, meter, simulation }, debugOnStart)
  return { meter, recordSimulation: (ms) => simulation.push(ms) }
}

interface PerfSources {
  readonly scene: Scene
  readonly engine: Engine
  readonly meter: FrameMeter
  readonly simulation: FrameMeter
}

function watchOverlay(overlay: HTMLElement, sources: PerfSources, debugOnStart: boolean): void {
  let read: (() => PerfSample) | undefined
  const show = (visible: boolean): void => {
    overlay.hidden = !visible
    read ??= visible ? instrumentSafely(sources) : undefined
  }
  show(debugOnStart)
  overlay.ownerDocument.addEventListener('keydown', (event) => {
    if (event.code !== 'F3') return
    event.preventDefault()
    show(overlay.hidden)
  })
  let samples = 0
  setInterval(() => {
    if (overlay.hidden || !read) return
    const sample = read()
    overlay.textContent = describePerfSample(sample).join('\n')
    samples += 1
    publish(sample, samples % LOG_EVERY_SAMPLES === 0)
  }, OVERLAY_EVERY_MS)
}

/**
 * O overlay é ferramenta de quem mede: se a instrumentação do babylon falhar
 * (extensão ausente, contexto sem suporte), ele mostra o que der, e o jogo
 * nunca para por causa dele.
 */
function instrumentSafely(sources: PerfSources): () => PerfSample {
  try {
    return instrument(sources)
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    console.warn(JSON.stringify({ event: 'perf-instrumentation-failed', message }))
    return () => fallbackSample(sources)
  }
}

function fallbackSample(sources: PerfSources): PerfSample {
  return {
    frame: sources.meter.stats(createFrameStats()),
    simulation: sources.simulation.stats(createFrameStats()),
    drawCalls: 0,
    activeMeshes: sources.scene.getActiveMeshes().length,
    activeMeshesEvalMs: 0,
    cpuFrameMs: 0,
    gpuMs: null,
    gpu: 'instrumentação indisponível',
  }
}

/** A instrumentação nasce só na primeira abertura do overlay: medir custa quadro. */
function instrument(sources: PerfSources): () => PerfSample {
  const scene = new SceneInstrumentation(sources.scene)
  scene.captureActiveMeshesEvaluationTime = true
  scene.captureFrameTime = true
  const engine = new EngineInstrumentation(sources.engine)
  engine.captureGPUFrameTime = true
  const frame = createFrameStats()
  const simulation = createFrameStats()
  const gpu = sources.engine.getGlInfo().renderer
  return () => ({
    frame: sources.meter.stats(frame),
    simulation: sources.simulation.stats(simulation),
    drawCalls: scene.drawCallsCounter.current,
    activeMeshes: sources.scene.getActiveMeshes().length,
    activeMeshesEvalMs: scene.activeMeshesEvaluationTimeCounter.lastSecAverage,
    cpuFrameMs: scene.frameTimeCounter.lastSecAverage,
    gpuMs: gpuFrameMs(engine),
    gpu,
  })
}

/** O contador de gpu vem em nanossegundos, e zero quando a extensão de timer não existe. */
function gpuFrameMs(engine: EngineInstrumentation): number | null {
  const ns = engine.gpuFrameTimeCounter.lastSecAverage
  return ns > 0 ? ns / 1e6 : null
}

declare global {
  interface Window {
    /** A última amostra, para o roteiro de medição ler pelo devtools ou pelo cdp. */
    __shobuPerf?: Record<string, number | string | null>
  }
}

function publish(sample: PerfSample, log: boolean): void {
  const record = perfLogRecord(sample)
  window.__shobuPerf = record
  if (log) console.info(JSON.stringify(record))
}
