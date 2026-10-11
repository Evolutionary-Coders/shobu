import { describe, expect, it } from 'vitest'
import type { BootLine } from './bootSequence.ts'
import { createProgressSink } from './progressSink.ts'
import type { LineSink } from './terminalPrinter.ts'

class FakeLineSink implements LineSink {
  readonly printed: BootLine[] = []

  append(line: BootLine): void {
    this.printed.push(line)
  }
}

const someLine: BootLine = { channel: 'telemetry', text: 'boot', tone: 'ok', delayMs: 10 }

describe('createProgressSink', () => {
  it('informa a fração impressa a cada linha', () => {
    const reported: number[] = []
    const sink = createProgressSink({
      target: new FakeLineSink(),
      totalLines: 4,
      report: (ratio) => reported.push(ratio),
    })
    for (let i = 0; i < 4; i += 1) sink.append(someLine)
    expect(reported).toEqual([0.25, 0.5, 0.75, 1])
  })

  it('repassa a linha para o sink de baixo, sem alterar nada', () => {
    const target = new FakeLineSink()
    createProgressSink({ target, totalLines: 1, report: () => {} }).append(someLine)
    expect(target.printed).toEqual([someLine])
  })

  /** Um skip despeja mais linhas do que o roteiro; a barra não passa de 100%. */
  it('trava em 1 quando imprimem mais linhas do que o total', () => {
    const reported: number[] = []
    const sink = createProgressSink({
      target: new FakeLineSink(),
      totalLines: 1,
      report: (ratio) => reported.push(ratio),
    })
    sink.append(someLine)
    sink.append(someLine)
    expect(reported).toEqual([1, 1])
  })

  it('rejeita total não positivo, que faria a barra dividir por zero', () => {
    expect(() =>
      createProgressSink({ target: new FakeLineSink(), totalLines: 0, report: () => {} }),
    ).toThrow(/totalLines recebeu 0/)
  })
})
