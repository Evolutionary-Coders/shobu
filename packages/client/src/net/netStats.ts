import type { ReconcileOutcome } from '../controller/predictionHistory.ts'

/** O resumo de uma janela de medição da rede, para o console em `?perf=1`. */
export interface NetStatsSummary {
  readonly event: 'net.stats'
  readonly windowS: number
  readonly fps: number
  /** Inputs enviados por segundo: o servidor consome um por tick. */
  readonly inputsPerS: number
  /** Inputs enviados e ainda não aplicados pelo servidor, no fim da janela. */
  readonly queue: number
  readonly rttMs: number | null
  readonly outcomes: Readonly<Partial<Record<ReconcileOutcome, number>>>
}

export interface NetStats {
  sent(seq: number): void
  outcome(outcome: ReconcileOutcome): void
  /** Um quadro. Devolve o resumo quando a janela fecha, e zera para a próxima. */
  frame(
    nowMs: number,
    ackSeq: number | undefined,
    rttMs: number | null,
  ): NetStatsSummary | undefined
}

/**
 * A medição da rede do lado do cliente, em janelas: quadros, inputs, a fila de
 * inputs à espera do servidor e o resultado da reconciliação. É o que separa
 * "o servidor está atrasado" de "a predição discorda" de "o quadro está lento".
 *
 * ```ts
 * const stats = createNetStats(2000)
 * const summary = stats.frame(performance.now(), confirmation?.ackSeq, network.latencyMs())
 * if (summary) console.info(JSON.stringify(summary))
 * ```
 */
export function createNetStats(windowMs: number): NetStats {
  const state = { startMs: Number.NaN, frames: 0, sent: 0, lastSeq: 0 }
  const counts: { outcomes: Partial<Record<ReconcileOutcome, number>> } = { outcomes: {} }
  return {
    sent: (seq) => {
      state.sent += 1
      state.lastSeq = seq
    },
    outcome: (outcome) => {
      counts.outcomes[outcome] = (counts.outcomes[outcome] ?? 0) + 1
    },
    frame: (nowMs, ackSeq, rttMs) => closeWindow(state, counts, windowMs, { nowMs, ackSeq, rttMs }),
  }
}

interface WindowState {
  startMs: number
  frames: number
  sent: number
  lastSeq: number
}

function closeWindow(
  state: WindowState,
  counts: { outcomes: Partial<Record<ReconcileOutcome, number>> },
  windowMs: number,
  now: { nowMs: number; ackSeq: number | undefined; rttMs: number | null },
): NetStatsSummary | undefined {
  if (Number.isNaN(state.startMs)) state.startMs = now.nowMs
  state.frames += 1
  const elapsedMs = now.nowMs - state.startMs
  if (elapsedMs < windowMs) return undefined
  const windowS = elapsedMs / 1000
  const summary: NetStatsSummary = {
    event: 'net.stats',
    windowS,
    fps: state.frames / windowS,
    inputsPerS: state.sent / windowS,
    queue: now.ackSeq === undefined ? 0 : state.lastSeq - now.ackSeq,
    rttMs: now.rttMs,
    outcomes: counts.outcomes,
  }
  Object.assign(state, { startMs: now.nowMs, frames: 0, sent: 0 })
  counts.outcomes = {}
  return summary
}
