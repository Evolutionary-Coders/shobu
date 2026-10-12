import {
  type MatchEndScreen,
  type MvpCard,
  mvpStats,
  type VoteOptionView,
} from '../matchEnd/matchEndScreen.ts'
import { writePortrait } from './arenaHudDeathNotice.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'
import type { ScoreboardRow } from './scoreboardRows.ts'

/**
 * A tela do fim de partida no visor de dom: FIM DE PARTIDA no congelamento, e
 * depois o MVP à esquerda, o placar final e o voto à direita, e a contagem no
 * alto — o centro fica livre para o corpo do MVP no pódio
 * (`mvpPodium.ts`). Adapter puro: o que escrever vem de
 * `matchEndScreen.ts`, e quem chama só chama quando a tela muda.
 *
 * O atributo `data-match-end` no visor esconde o resto do hud (arenaMatchEnd.css),
 * e o mesmo atributo na raiz do documento esconde os controles de toque, que
 * ficam por cima de tudo e engoliriam o toque no voto.
 */
export interface MatchEndPanel {
  set(screen: MatchEndScreen | null): void
}

/**
 * ```ts
 * const panel = createMatchEndPanel(document, hudSection)
 * panel.set(matchEndScreenOf(input))
 * ```
 */
export function createMatchEndPanel(root: ElementQuery, hud: HTMLElement): MatchEndPanel {
  const view = {
    count: requireElement<HTMLElement>(root, '.match-end-count'),
    mvpName: requireElement<HTMLElement>(root, '.mvp-name'),
    portrait: requireElement<HTMLImageElement>(root, '.mvp-portrait'),
    stats: requireElement<HTMLElement>(root, '.mvp-stats'),
    standings: requireElement<HTMLTableSectionElement>(root, '#match-end-standings'),
    options: requireElement<HTMLElement>(root, '.map-vote-options'),
    next: requireElement<HTMLElement>(root, '.map-vote-next'),
  }
  return {
    set: (screen) => {
      const phase = screen?.phase ?? 'off'
      hud.dataset.matchEnd = phase
      hud.ownerDocument.documentElement.dataset.matchEnd = phase
      if (screen) writeScreen(view, screen)
    },
  }
}

interface MatchEndView {
  readonly count: HTMLElement
  readonly mvpName: HTMLElement
  readonly portrait: HTMLImageElement
  readonly stats: HTMLElement
  readonly standings: HTMLTableSectionElement
  readonly options: HTMLElement
  readonly next: HTMLElement
}

function writeScreen(view: MatchEndView, screen: MatchEndScreen): void {
  view.count.textContent = String(screen.secondsLeft).padStart(2, '0')
  view.next.textContent = screen.nextMapLabel ?? ''
  if (screen.mvp) writeMvp(view, screen.mvp)
  writeStandings(view.standings, screen.standings)
  view.options.replaceChildren(...screen.options.map(voteOptionElement))
}

function writeMvp(view: MatchEndView, mvp: MvpCard): void {
  view.mvpName.textContent = mvp.name
  view.mvpName.dataset.local = String(mvp.local)
  writePortrait(view.portrait, mvp.portraitUrl)
  view.stats.replaceChildren(
    ...mvpStats(mvp).map((stat) => {
      const line = element('div', 'mvp-stat')
      line.append(element('dt', 'mvp-stat-label', stat.label))
      line.append(element('dd', 'mvp-stat-value', stat.value))
      return line
    }),
  )
}

/** Uma vez por segundo, no máximo, e quatro linhas: recriar é mais simples que reaproveitar. */
function writeStandings(body: HTMLTableSectionElement, rows: readonly ScoreboardRow[]): void {
  body.replaceChildren()
  for (const row of rows) {
    const line = body.insertRow()
    line.dataset.local = String(row.local)
    line.dataset.lead = String(row.rank === 1)
    for (const text of [String(row.rank).padStart(2, '0'), row.name, String(row.points)]) {
      line.insertCell().textContent = text
    }
    line.insertCell().textContent = `${row.kills}/${row.deaths}`
  }
}

/**
 * Uma opção do voto: botão de verdade, para o toque e o clique de quem não
 * está com o ponteiro travado; com ele travado, quem vota é o foco
 * (`driveMatchEnd.ts`).
 */
function voteOptionElement(option: VoteOptionView, index: number): HTMLElement {
  const button = element('button', 'map-vote-option')
  button.setAttribute('type', 'button')
  button.dataset.voteOption = String(index)
  button.dataset.mine = String(option.mine)
  button.dataset.focused = String(option.focused)
  button.dataset.winner = String(option.winner)
  button.append(
    element('span', 'map-vote-key', String(index + 1)),
    element('span', 'map-vote-label', option.label),
    element('span', 'map-vote-count', String(option.votes)),
    element('span', 'map-vote-voters', option.voters.join(' · ')),
  )
  return button
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const created = document.createElement(tag)
  created.className = className
  if (text !== undefined) created.textContent = text
  return created
}
