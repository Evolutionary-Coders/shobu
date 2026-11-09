import { writeThinBar } from './hudComponentsDom.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'
import type { ScorestreakRow, ScorestreakToast } from './scorestreakReadout.ts'

/**
 * As séries de pontuação no visor (ADR 0029), em dom: uma linha por slot com
 * a miniatura, a tecla, o nome, o custo e a barra fina dos pontos da vida, e
 * a legenda que acende quando uma série fica pronta ou é acionada. Adapter:
 * quem decide o texto, a fração e a fase é o `scorestreakReadout.ts`, e quem
 * apaga e acende a miniatura é o css, pelo `data-phase`.
 */
export interface ScorestreakPanel {
  /** As três linhas. Só quando mudam (`scorestreakReadoutKey`), nunca por quadro. */
  setRows(rows: readonly ScorestreakRow[]): void
  /** Acende a legenda do começo, com a miniatura; ela some sozinha, por animação de css. */
  showToast(toast: ScorestreakToast): void
}

interface ScorestreakLine {
  readonly item: HTMLElement
  readonly icon: HTMLImageElement
  readonly key: HTMLElement
  readonly label: HTMLElement
  readonly cost: HTMLElement
  readonly bar: HTMLElement
}

/**
 * ```ts
 * const streaks = createScorestreakPanel(document)
 * streaks.showToast({ text: 'PING ATIVADO', iconUrl: scorestreakIconUrl('ping') })
 * ```
 */
export function createScorestreakPanel(root: ElementQuery): ScorestreakPanel {
  const list = requireElement<HTMLElement>(root, '#hud-scorestreaks')
  const toast = requireElement<HTMLElement>(root, '#hud-scorestreak-toast')
  const toastText = requireElement<HTMLElement>(root, '#hud-scorestreak-toast-text')
  const toastIcon = requireElement<HTMLImageElement>(root, '#hud-scorestreak-toast-icon')
  const lines: ScorestreakLine[] = []
  let toggle = 'a'
  return {
    setRows: (rows) => {
      while (lines.length < rows.length) lines.push(appendLine(list))
      for (const [index, row] of rows.entries()) writeLine(lines[index] as ScorestreakLine, row)
    },
    showToast: ({ text, iconUrl }) => {
      toastText.textContent = text
      if (toastIcon.getAttribute('src') !== iconUrl) toastIcon.src = iconUrl
      // a/b como na dica da lâmina: o mesmo valor não reiniciaria a animação.
      toggle = toggle === 'a' ? 'b' : 'a'
      toast.dataset.toast = toggle
    },
  }
}

/** Uma linha nova no fim da lista: a miniatura, a tecla, o nome, o custo e a barra. */
function appendLine(list: HTMLElement): ScorestreakLine {
  const make = <T extends HTMLElement>(tag: string, className: string): T => {
    const element = list.ownerDocument.createElement(tag) as T
    element.className = className
    return element
  }
  const item = make('li', 'hud-streak')
  const icon = make<HTMLImageElement>('img', 'hud-streak-icon')
  // o nome está escrito ao lado: o alt repetiria a mesma palavra.
  icon.alt = ''
  icon.width = 48
  icon.height = 48
  const key = make('span', 'kanji-chip hud-streak-key')
  const label = make('span', 'hud-streak-label')
  const cost = make('span', 'hud-caption-code')
  const bar = make('div', 'thin-bar thin-bar--hair')
  bar.dataset.tone = 'yellow'
  item.append(icon, key, label, cost, bar)
  list.append(item)
  return { item, icon, key, label, cost, bar }
}

/** O mesmo `src` não é reescrito: reescrevê-lo recarregaria a imagem a cada ponto. */
function writeLine(line: ScorestreakLine, row: ScorestreakRow): void {
  if (line.icon.getAttribute('src') !== row.iconUrl) line.icon.src = row.iconUrl
  line.key.textContent = row.keyHint
  line.label.textContent = row.label
  line.cost.textContent = `${row.cost}`
  line.item.dataset.phase = row.phase
  writeThinBar(line.bar, row.progress)
}
