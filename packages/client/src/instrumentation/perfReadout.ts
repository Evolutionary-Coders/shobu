import type { FrameStats } from './frameMeter.ts'

/**
 * O que o bloco de FPS e ping do hud mostra, já como texto, e a cor do FPS.
 * Dado puro: quem escreve no dom é `hud/arenaHudPerf.ts`, e só quando algo
 * aqui muda.
 */
export type FpsTone = 'good' | 'warn' | 'bad'

/** Nenhum monitor da feira é mais lento que isto, e 60 FPS é o alvo do jogo. */
export const MIN_REFRESH_HZ = 60

export interface PerfReadout {
  readonly fps: string
  readonly frameMs: string
  readonly tone: FpsTone
  readonly ping: string
}

/**
 * A cor é relativa ao **monitor**, e não a um número fixo: 60 FPS é perfeito
 * num monitor de 60 Hz e meio jogo num de 144. A taxa do monitor vem da
 * mediana dos intervalos, com **piso de 60 Hz**:
 * - o piso pinta de vermelho 30 FPS estáveis num monitor de 60 Hz, que a
 *   mediana sozinha (33 ms) faria "acompanhar" (revisão do PR #23);
 * - a mediana, e não o quadro mais rápido, porque um único quadro curto depois
 *   de um atrasado (12–14 ms a 60 Hz) fazia o monitor parecer de 80 Hz, e o
 *   jogo liso a 60 FPS saía amarelo (revisão do PR #24).
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
  const refreshHz = stats.medianMs > 0 ? Math.max(MIN_REFRESH_HZ, 1000 / stats.medianMs) : 0
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
