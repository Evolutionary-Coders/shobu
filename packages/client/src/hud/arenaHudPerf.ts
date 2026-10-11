import type { PerfReadout } from '../instrumentation/perfReadout.ts'
import { createGlyphLabel } from './hudComponentsDom.ts'
import type { GlyphSheet } from './hudGlyphText.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'

/** O bloco de FPS e ping do hud (`index.html`, `#hud-perf`). */
export interface PerfPanel {
  /** O texto e a cor de agora. Escreve no dom só o que mudou. */
  show(readout: PerfReadout): void
  /** A configuração MOSTRAR FPS/PING. */
  setVisible(visible: boolean): void
}

const FPS_HEIGHT_PX = 16

/**
 * Adapter puro de dom, no molde do `arenaHudStatus.ts`: o número vai pela
 * folha de glifos, e só é reescrito quando muda (`createGlyphLabel` já guarda
 * o último texto). Quem decide o texto é `perfReadout.ts`.
 *
 * ```ts
 * const panel = createPerfPanel(document, glyphs)
 * panel.show(perfReadout(stats, latency.latencyMs()))
 * ```
 */
export function createPerfPanel(root: ElementQuery, sheet: GlyphSheet): PerfPanel {
  const panel = requireElement<HTMLElement>(root, '#hud-perf')
  const fps = createGlyphLabel(requireElement(root, '#hud-perf-fps'), {
    sheet,
    heightPx: FPS_HEIGHT_PX,
    // o FPS muda a toda leitura: com o glitch de troca, o número tremeria sem parar.
    glitch: false,
  })
  const frameMs = requireElement<HTMLElement>(root, '#hud-perf-ms')
  const ping = requireElement<HTMLElement>(root, '#hud-perf-ping')
  return {
    show: (readout) => {
      fps.write(readout.fps)
      writeText(frameMs, readout.frameMs)
      writeText(ping, readout.ping)
      if (panel.dataset.tone !== readout.tone) panel.dataset.tone = readout.tone
    },
    setVisible: (visible) => {
      if (panel.hidden === !visible) return
      panel.hidden = !visible
    },
  }
}

function writeText(target: HTMLElement, text: string): void {
  if (target.textContent !== text) target.textContent = text
}
