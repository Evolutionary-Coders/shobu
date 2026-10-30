import { writeThinBar } from './hudComponentsDom.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'
import type { ScorestreakRow } from './scorestreakReadout.ts'

/**
 * As séries de pontuação no visor (ADR 0029), em dom: uma linha por slot com
 * o nome, o custo e a barra fina dos pontos da vida, e a legenda que acende
 * quando uma série fica pronta ou é acionada. Adapter: quem decide o texto e
 * a fração é o `scorestreakReadout.ts`.
 */
export interface ScorestreakPanel {
  /** As três linhas. Só quando mudam (`scorestreakReadoutKey`), nunca por quadro. */
  setRows(rows: readonly ScorestreakRow[]): void
  /** Acende a legenda do começo; ela some sozinha, por animação de css. */
  showToast(text: string): void
}

interface ScorestreakLine {
  readonly item: HTMLElement
  readonly label: HTMLElement
  readonly cost: HTMLElement
  readonly bar: HTMLElement
}

/**
 * ```ts
 * const streaks = createScorestreakPanel(document)
 * streaks.showToast('PING ATIVADO')
 * ```
 */
export function createScorestreakPanel(root: ElementQuery): ScorestreakPanel {
  const list = requireElement<HTMLElement>(root, '#hud-scorestreaks')
  const toast = requireElement<HTMLElement>(root, '#hud-scorestreak-toast')
  const toastText = requireElement<HTMLElement>(root, '#hud-scorestreak-toast-text')
  const lines: ScorestreakLine[] = []
  let toggle = 'a'
  return {
    setRows: (rows) => {
      while (lines.length < rows.length) lines.push(appendLine(list, lines.length))
      for (const [index, row] of rows.entries()) writeLine(lines[index] as ScorestreakLine, row)
    },
    showToast: (text) => {
      toastText.textContent = text
      // a/b como na dica da lâmina: o mesmo valor não reiniciaria a animação.
      toggle = toggle === 'a' ? 'b' : 'a'
      toast.dataset.toast = toggle
    },
  }
}

/** Uma linha nova no fim da lista: o número do slot, o nome, o custo e a barra. */
function appendLine(list: HTMLElement, index: number): ScorestreakLine {
  const make = (tag: string, className: string): HTMLElement => {
    const element = list.ownerDocument.createElement(tag)
    element.className = className
    return element
  }
  const item = make('li', 'hud-streak')
  const slot = make('span', 'kanji-chip')
  slot.textContent = `${index + 1}`
  const label = make('span', 'hud-streak-label')
  const cost = make('span', 'hud-caption-code')
  const bar = make('div', 'thin-bar thin-bar--hair')
  bar.dataset.tone = 'yellow'
  item.append(slot, label, cost, bar)
  list.append(item)
  return { item, label, cost, bar }
}

function writeLine(line: ScorestreakLine, row: ScorestreakRow): void {
  line.label.textContent = row.label
  line.cost.textContent = `${row.cost}`
  line.item.dataset.ready = String(row.ready)
  writeThinBar(line.bar, row.progress)
}
