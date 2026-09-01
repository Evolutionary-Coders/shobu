import { describe, expect, it } from 'vitest'
import type { BootLine } from './bootSequence.ts'
import { createTerminalPrinter, type LineSink } from './terminalPrinter.ts'

class FakeLineSink implements LineSink {
  readonly printed: BootLine[] = []

  append(line: BootLine): void {
    this.printed.push(line)
  }
}

class FakeClock {
  readonly waited: number[] = []

  wait = async (ms: number): Promise<void> => {
    this.waited.push(ms)
  }
}

const lines: readonly BootLine[] = [
  { channel: 'main', text: 'boot', tone: 'system', delayMs: 300 },
  { channel: 'telemetry', text: 'mem', tone: 'ok', delayMs: 70 },
  { channel: 'uplink', text: 'ok', tone: 'accent', delayMs: 200 },
]

describe('createTerminalPrinter', () => {
  it('imprime todas as linhas na ordem, respeitando cada pausa', async () => {
    const sink = new FakeLineSink()
    const clock = new FakeClock()
    await createTerminalPrinter({ lines, sink, wait: clock.wait }).play()
    expect(sink.printed.map((line) => line.text)).toEqual(['boot', 'mem', 'ok'])
    expect(clock.waited).toEqual([300, 70, 200])
  })

  it('despeja o resto sem esperar depois do skip', async () => {
    const sink = new FakeLineSink()
    const clock = new FakeClock()
    const printer = createTerminalPrinter({ lines, sink, wait: clock.wait })
    printer.skip()
    await printer.play()
    expect(sink.printed).toHaveLength(3)
    expect(clock.waited).toEqual([])
  })

  it('rejeita roteiro vazio, que deixaria a intro em tela preta', () => {
    const sink = new FakeLineSink()
    const clock = new FakeClock()
    expect(() => createTerminalPrinter({ lines: [], sink, wait: clock.wait })).toThrow(/vazia/)
  })
})
