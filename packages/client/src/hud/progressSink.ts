import type { BootLine } from './bootSequence.ts'
import type { LineSink } from './terminalPrinter.ts'

export interface ProgressSinkOptions {
  /** Para onde a linha segue depois de contada. */
  readonly target: LineSink
  readonly totalLines: number
  /** Recebe 0 a 1. Chamado uma vez por linha impressa. */
  readonly report: (ratio: number) => void
}

/**
 * Decorador de `LineSink` que conta linhas impressas e informa o progresso.
 *
 * Existe porque a barra da tela de boot era um `96%` fixo no html: um número
 * inventado numa tela cujo argumento inteiro é que os números são verdadeiros.
 * Contar a impressão é a única fonte honesta de progresso que a intro tem.
 *
 * ```ts
 * const sink = createProgressSink({ target: router, totalLines: lines.length, report })
 * ```
 */
export function createProgressSink(options: ProgressSinkOptions): LineSink {
  if (options.totalLines <= 0) {
    throw new RangeError(
      `totalLines recebeu ${options.totalLines}; esperado um inteiro maior que zero`,
    )
  }
  let printed = 0
  return {
    append(line: BootLine) {
      options.target.append(line)
      printed += 1
      options.report(Math.min(1, printed / options.totalLines))
    },
  }
}
