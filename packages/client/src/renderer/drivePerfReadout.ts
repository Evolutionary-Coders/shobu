import type { PerfPanel } from '../hud/arenaHudPerf.ts'
import { createFrameStats, type FrameMeter } from '../instrumentation/frameMeter.ts'
import type { LatencySource } from '../instrumentation/latencySource.ts'
import { type PerfReadout, perfReadout, sameReadout } from '../instrumentation/perfReadout.ts'
import type { PlayerSettings } from '../settings/playerSettingsSpec.ts'

/**
 * Duas leituras por segundo: o olho não acompanha mais que isso num número que
 * muda, e o hud não escreve no dom a cada quadro (o mesmo cuidado do relógio
 * em `arenaHudStatus.ts`).
 */
const READOUT_EVERY_MS = 500

export interface PerfReadoutSources {
  readonly meter: FrameMeter
  readonly latency: LatencySource
  readonly settings: () => PlayerSettings
}

/**
 * Leva o medidor de quadros e a latência ao bloco de FPS e ping do hud, e
 * obedece à configuração MOSTRAR FPS/PING ao vivo.
 *
 * ```ts
 * drivePerfReadout(panel, { meter: perf.meter, latency: NULL_LATENCY_SOURCE, settings: live.current })
 * ```
 */
export function drivePerfReadout(panel: PerfPanel, sources: PerfReadoutSources): void {
  const stats = createFrameStats()
  let shown: PerfReadout | undefined
  setInterval(() => {
    const visible = sources.settings().showPerf === 1
    panel.setVisible(visible)
    if (!visible) return
    const readout = perfReadout(sources.meter.stats(stats), sources.latency.latencyMs())
    if (sameReadout(shown, readout)) return
    shown = readout
    panel.show(readout)
  }, READOUT_EVERY_MS)
}
