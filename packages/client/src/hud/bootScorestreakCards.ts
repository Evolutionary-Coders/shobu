import type { ScorestreakCard } from '../loadout/scorestreakCards.ts'

/**
 * A grade de cartões da tela das SÉRIES DE PONTUAÇÃO, em dom: a miniatura, o
 * nome, o custo e o número da linha que leva a série; embaixo, o que a série
 * em foco faz. Adapter: quem decide escolhida, foco e custo é o
 * `scorestreakCardsOf`, e o destaque é css, por atributo
 * (`bootScorestreaks.css`).
 *
 * Os cartões são montados aqui, e não à mão no `index.html` como as linhas:
 * eles saem do catálogo e do custo do config, e sete cópias escritas à mão
 * envelheceriam a cada série nova.
 */
export type ScorestreakCardWriter = (cards: readonly ScorestreakCard[]) => void

interface CardNodes {
  readonly item: HTMLElement
  readonly icon: HTMLImageElement
  readonly badge: HTMLElement
  readonly name: HTMLElement
  readonly cost: HTMLElement
}

/**
 * ```ts
 * const writeCards = mountScorestreakCards(requireElement(document, '#scorestreak-cards'))
 * writeCards(scorestreakCardsOf(state.scorestreaks, state.scorestreaksIndex, config.scorestreaks))
 * ```
 */
export function mountScorestreakCards(list: HTMLElement): ScorestreakCardWriter {
  const nodes: CardNodes[] = []
  const detail = list.ownerDocument.createElement('li')
  detail.className = 'streak-detail'
  return (cards) => {
    while (nodes.length < cards.length) nodes.push(appendCard(list))
    for (const [index, card] of cards.entries()) writeCard(nodes[index] as CardNodes, card)
    // a linha do que a série em foco faz, embaixo da grade inteira: no cartão
    // de 56 px ela não cabe, e só a do foco importa para escolher.
    list.append(detail)
    writeDetail(
      detail,
      cards.find((card) => card.focused),
    )
  }
}

function writeDetail(detail: HTMLElement, card: ScorestreakCard | undefined): void {
  if (!card) {
    setText(detail, '')
    return
  }
  setText(detail, `${card.label} · ${card.blurb}`)
}

function appendCard(list: HTMLElement): CardNodes {
  const make = <T extends HTMLElement>(tag: string, className: string): T => {
    const element = list.ownerDocument.createElement(tag) as T
    element.className = className
    return element
  }
  const item = make('li', 'streak-card')
  const icon = make<HTMLImageElement>('img', 'streak-card-icon')
  // o nome já está escrito no cartão: o alt repetiria a mesma palavra.
  icon.alt = ''
  icon.width = 128
  icon.height = 128
  icon.decoding = 'async'
  const badge = make('span', 'streak-card-slot')
  const name = make('span', 'streak-card-name')
  const cost = make('span', 'streak-card-cost')
  item.append(icon, badge, name, cost)
  list.append(item)
  return { item, icon, badge, name, cost }
}

/** Só escreve o que mudou: a seta reescreve a grade inteira, e o mesmo `src` recarregaria a imagem. */
function writeCard(nodes: CardNodes, card: ScorestreakCard): void {
  if (nodes.icon.getAttribute('src') !== card.iconUrl) nodes.icon.src = card.iconUrl
  setText(nodes.name, card.label)
  setText(nodes.cost, `${card.cost}`)
  setText(nodes.badge, card.slot === null ? '' : `${card.slot + 1}`)
  const { dataset } = nodes.item
  if (dataset.tier !== card.tier) dataset.tier = card.tier
  const picked = String(card.slot !== null)
  if (dataset.picked !== picked) dataset.picked = picked
  const focused = String(card.focused)
  if (dataset.focused !== focused) dataset.focused = focused
}

function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text
}
