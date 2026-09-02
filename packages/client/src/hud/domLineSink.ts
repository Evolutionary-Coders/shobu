import type { BootChannel, BootLine } from './bootSequence.ts'
import type { LineSink } from './terminalPrinter.ts'

export type ChannelTargets = Readonly<Record<BootChannel, HTMLElement>>

/**
 * Adapter de dom do `LineSink`: manda cada linha para a região de tela do canal
 * dela. É a única parte da intro que toca o documento, e por isso é a única
 * sem teste unitário — o resto do boot roda em node contra um sink falso.
 */
export function createBootLineRouter(targets: ChannelTargets): LineSink {
  return {
    append(line: BootLine) {
      const target = targets[line.channel]
      target.append(createLineElement(target, line))
      target.scrollTop = target.scrollHeight
    },
  }
}

function createLineElement(target: HTMLElement, line: BootLine): HTMLElement {
  const element = target.ownerDocument.createElement('span')
  element.className = `boot-line boot-line--${line.tone}`
  element.textContent = line.text
  return element
}
