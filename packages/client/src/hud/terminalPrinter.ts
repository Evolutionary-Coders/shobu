import type { BootLine } from './bootSequence.ts'

/** Para onde a linha impressa vai. O dom fica atrás disto, e o teste também. */
export interface LineSink {
  append(line: BootLine): void
}

export interface TerminalPrinterOptions {
  readonly lines: readonly BootLine[]
  readonly sink: LineSink
  readonly wait: (ms: number) => Promise<void>
}

export interface TerminalPrinter {
  /** Imprime tudo, respeitando o ritmo. Resolve quando a última linha saiu. */
  play(): Promise<void>
  /**
   * Despeja o resto de uma vez. O pilar 2 manda mais que a cinemática: quem
   * quer jogar em dois segundos não pode ser preso por uma animação bonita.
   */
  skip(): void
}

/**
 * ```ts
 * const printer = createTerminalPrinter({ lines, sink, wait })
 * void printer.play()
 * printer.skip() // no primeiro clique
 * ```
 */
export function createTerminalPrinter(options: TerminalPrinterOptions): TerminalPrinter {
  if (options.lines.length === 0) {
    throw new RangeError('lines recebeu lista vazia; esperado ao menos uma linha de boot')
  }
  let skipped = false
  return {
    skip: () => {
      skipped = true
    },
    play: async () => {
      for (const line of options.lines) {
        if (!skipped) await options.wait(line.delayMs)
        options.sink.append(line)
      }
    },
  }
}
