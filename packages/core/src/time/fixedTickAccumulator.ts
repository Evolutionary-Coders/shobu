/**
 * Converte tempo real de quadro em número inteiro de ticks de duração fixa.
 * Tick de duração fixa é requisito da ADR 0003: delta variável dentro do
 * núcleo faz cliente e servidor divergirem, e a divergência aparece como
 * rubber-banding.
 */
export interface FixedTickAccumulator {
  readonly tickDurationS: number
  readonly maxTicksPerFrame: number
  pendingS: number
}

/**
 * ```ts
 * const accumulator = createFixedTickAccumulator(60, 5)
 * const ticks = consumeTicks(accumulator, 0.05) // 3
 * ```
 *
 * @param maxTicksPerFrame teto por quadro. Sem ele, um quadro longo pede mais
 * ticks do que cabe no próximo quadro, que fica mais longo ainda — a espiral
 * da morte. O excedente é descartado: o jogo atrasa, mas não trava.
 */
export function createFixedTickAccumulator(
  tickHz: number,
  maxTicksPerFrame: number,
): FixedTickAccumulator {
  if (!Number.isFinite(tickHz) || tickHz <= 0) {
    throw new RangeError(`tickHz recebeu ${tickHz}; esperado número finito > 0`)
  }
  if (!Number.isInteger(maxTicksPerFrame) || maxTicksPerFrame < 1) {
    throw new RangeError(`maxTicksPerFrame recebeu ${maxTicksPerFrame}; esperado inteiro >= 1`)
  }
  return { tickDurationS: 1 / tickHz, maxTicksPerFrame, pendingS: 0 }
}

/** Devolve quantos ticks inteiros cabem no tempo acumulado e os consome. */
export function consumeTicks(accumulator: FixedTickAccumulator, elapsedS: number): number {
  if (!Number.isFinite(elapsedS) || elapsedS < 0) {
    throw new RangeError(`elapsedS recebeu ${elapsedS}; esperado número finito >= 0`)
  }
  accumulator.pendingS += elapsedS
  const requested = Math.floor(accumulator.pendingS / accumulator.tickDurationS)
  const granted = Math.min(requested, accumulator.maxTicksPerFrame)
  accumulator.pendingS -= requested * accumulator.tickDurationS
  return granted
}
