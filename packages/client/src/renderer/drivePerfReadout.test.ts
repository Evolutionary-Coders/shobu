import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PerfPanel } from '../hud/arenaHudPerf.ts'
import { createFrameMeter } from '../instrumentation/frameMeter.ts'
import { NULL_LATENCY_SOURCE } from '../instrumentation/latencySource.ts'
import type { PerfReadout } from '../instrumentation/perfReadout.ts'
import { DEFAULT_PLAYER_SETTINGS } from '../settings/playerSettingsSpec.ts'
import { drivePerfReadout } from './drivePerfReadout.ts'

/** O bloco do hud de mentira: anota o que recebeu. */
class FakePerfPanel implements PerfPanel {
  readonly shown: PerfReadout[] = []
  visible: boolean | undefined
  show(readout: PerfReadout): void {
    this.shown.push(readout)
  }
  setVisible(visible: boolean): void {
    this.visible = visible
  }
}

function sixtyHz() {
  const meter = createFrameMeter()
  for (let frame = 0; frame < 60; frame += 1) meter.push(1000 / 60)
  return meter
}

describe('drivePerfReadout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('mostra o FPS e o ping a cada meio segundo', () => {
    const panel = new FakePerfPanel()
    const settings = { ...DEFAULT_PLAYER_SETTINGS }
    drivePerfReadout(panel, {
      meter: sixtyHz(),
      latency: NULL_LATENCY_SOURCE,
      settings: () => settings,
    })
    vi.advanceTimersByTime(500)
    expect(panel.visible).toBe(true)
    expect(panel.shown).toEqual([{ fps: '60', frameMs: '16.7', tone: 'good', ping: '--' }])
  })

  it('não reescreve o hud quando nada mudou', () => {
    const panel = new FakePerfPanel()
    drivePerfReadout(panel, {
      meter: sixtyHz(),
      latency: NULL_LATENCY_SOURCE,
      settings: () => DEFAULT_PLAYER_SETTINGS,
    })
    vi.advanceTimersByTime(2000)
    expect(panel.shown).toHaveLength(1)
  })

  it('com MOSTRAR FPS/PING em NÃO, esconde e não lê nada', () => {
    const panel = new FakePerfPanel()
    const settings = { ...DEFAULT_PLAYER_SETTINGS, showPerf: 0 }
    drivePerfReadout(panel, {
      meter: sixtyHz(),
      latency: NULL_LATENCY_SOURCE,
      settings: () => settings,
    })
    vi.advanceTimersByTime(500)
    expect([panel.visible, panel.shown.length]).toEqual([false, 0])
  })
})
