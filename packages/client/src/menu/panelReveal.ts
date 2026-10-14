/**
 * Quanto o painel de uma sub-tela do menu rola para a linha escolhida ficar à
 * vista. É a conta que o `scrollIntoView` fazia — e o motivo de ele ter saído
 * (12/10): o `scrollIntoView` rola **todo** ancestral rolável até a janela,
 * e o `#boot-overlay`, com `overflow: hidden`, é rolável por script. Descer
 * até uma linha abaixo do meio da tela rolava a tela de boot inteira para
 * cima, e o jogo aparecia por baixo dela.
 *
 * Aqui só o painel rola, e só o necessário: a linha já à vista não mexe nada,
 * e a que sai dela puxa o painel até sobrar `marginPx` entre ela e a borda —
 * o colchete da seleção nunca fica cortado, e a lista não pula a cada seta.
 */

/** O painel rolável, em pixels: quanto já rolou, quanto se vê, quanto tem. */
export interface ScrollWindow {
  readonly scrollTop: number
  readonly clientHeight: number
  readonly scrollHeight: number
}

/** A linha, no espaço do conteúdo rolável: topo a partir do início do painel. */
export interface RowSpan {
  readonly top: number
  readonly height: number
}

/**
 * ```ts
 * revealScrollTop({ scrollTop: 0, clientHeight: 300, scrollHeight: 600 }, { top: 320, height: 30 }, 30)
 * // 80: a linha e a margem de baixo cabem na janela
 * ```
 */
export function revealScrollTop(view: ScrollWindow, row: RowSpan, marginPx: number): number {
  const maxScrollTop = Math.max(0, view.scrollHeight - view.clientHeight)
  return Math.min(maxScrollTop, Math.max(0, wantedScrollTop(view, row, marginPx)))
}

function wantedScrollTop(view: ScrollWindow, row: RowSpan, marginPx: number): number {
  const top = row.top - marginPx
  if (top < view.scrollTop) return top
  const bottom = row.top + row.height + marginPx
  if (bottom > view.scrollTop + view.clientHeight) return bottom - view.clientHeight
  return view.scrollTop
}
