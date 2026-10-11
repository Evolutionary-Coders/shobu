import type { FrameStats } from './frameMeter.ts'

/**
 * O que o bloco de FPS e ping do hud mostra, já como texto, e a cor do FPS.
 * Dado puro: quem escreve no dom é `hud/arenaHudPerf.ts`, e só quando algo
 * aqui muda.
 */
export type FpsTone = 'good' | 'warn' | 'bad'

export interface PerfReadout {
  readonly fps: string
  readonly frameMs: string
  readonly tone: FpsTone
  readonly ping: string
}

/**
 * A cor é relativa ao **monitor**, e não a um número fixo: 60 FPS é perfeito
 * num monitor de 60 Hz e meio jogo num de 144. A taxa do monitor é a mediana
 * dos intervalos (`FrameStats.medianMs`): quando o jogo acompanha o vsync, a
 * mediana é o próprio intervalo de varredura.
 *
 * Verde a partir de 90% da taxa, amarelo a partir de 60%, vermelho abaixo.
 *
 * ```ts
 * fpsTone(140, 144) // 'good'
 * ```
 */
export function fpsTone(fps: number, refreshHz: number): FpsTone {
  if (!(refreshHz > 0)) return 'good'
  const ratio = fps / refreshHz
  if (ratio >= 0.9) return 'good'
  return ratio >= 0.6 ? 'warn' : 'bad'
}

/**
 * ```ts
 * perfReadout(stats, null) // { fps: '143', frameMs: '7.0', tone: 'good', ping: '--' }
 * ```
 */
export function perfReadout(stats: Readonly<FrameStats>, latencyMs: number | null): PerfReadout {
  const refreshHz = stats.medianMs > 0 ? 1000 / stats.medianMs : 0
  return {
    // três dígitos bastam: acima de 999 FPS o número é ruído de relógio.
    fps: String(Math.min(999, Math.round(stats.fps))),
    frameMs: stats.meanMs.toFixed(1),
    tone: fpsTone(stats.fps, refreshHz),
    ping: latencyMs === null ? '--' : String(Math.round(latencyMs)),
  }
}

/** O dom só é escrito quando o que aparece muda: o hud não escreve a cada quadro. */
export function sameReadout(a: PerfReadout | undefined, b: PerfReadout): boolean {
  return (
    a !== undefined &&
    a.fps === b.fps &&
    a.frameMs === b.frameMs &&
    a.tone === b.tone &&
    a.ping === b.ping
  )
}
