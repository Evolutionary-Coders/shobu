import type { MedalAward } from '@shobu/core'
import { createKillfeed, type KillEntry, type KillfeedLine } from './killfeed.ts'
import { type MedalToast, medalToasts, toastDelayMs } from './medalFeed.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'
import { killPointsField } from './visorFields.ts'

/**
 * O que o hud mostra por evento de kill: o killfeed no alto à direita, as
 * medalhas no alto ao centro e os pontos junto da retícula. Os três montam
 * nós novos a cada evento, porque reaproveitar nó não reinicia a animação de
 * entrada — e são as animações de css que os fazem sumir sem relógio nenhum.
 */
export interface KillFeeds {
  pushKill(entry: KillEntry): void
  pushMedals(awards: readonly MedalAward[]): void
  showKillPoints(points: number, medals: readonly string[]): void
}

/**
 * ```ts
 * const feeds = createKillFeeds(document)
 * feeds.pushKill({ killer: 'VOCÊ', victim: 'ONRYO', weapon: 'SNIPER', mine: true })
 * ```
 */
export function createKillFeeds(root: ElementQuery): KillFeeds {
  const feed = requireElement<HTMLElement>(root, '#hud-killfeed')
  const medals = requireElement<HTMLElement>(root, '#hud-medals')
  const killfeed = createKillfeed()
  const showKillPoints = createKillPoints(root)
  return {
    pushKill: (entry) => {
      feed.replaceChildren(...killfeed.push(entry).map((line) => killLine(feed, line)))
    },
    pushMedals: (awards) => writeMedalFeed(medals, awards),
    showKillPoints,
  }
}

/**
 * Quatro nós numa taxa de alguns por minuto é churn de dom no lado certo da
 * conta: reaproveitar o nó não reinicia a animação de entrada, e a linha antiga
 * nunca sumiria.
 */
function killLine(feed: HTMLElement, line: KillfeedLine): HTMLElement {
  const node = feed.ownerDocument.createElement('p')
  node.className = line.tone === 'mine' ? 'kill-line kill-line--mine' : 'kill-line'
  node.textContent = line.text
  return node
}

type KillPointsWriter = KillFeeds['showKillPoints']

function createKillPoints(root: ElementQuery): KillPointsWriter {
  const killPoints = requireElement<HTMLElement>(root, '#hud-killpoints')
  const value = requireElement<HTMLElement>(root, '.killpoints-value')
  const earned = requireElement<HTMLElement>(root, '.killpoints-medals')
  const state = { toggle: 'a' }
  return (points, labels) => {
    value.textContent = killPointsField(points)
    earned.replaceChildren(...labels.map((label) => medalTally(earned, label)))
    // alternar o nome da animação é o que a reinicia (ver arenaReticle.css).
    state.toggle = state.toggle === 'a' ? 'b' : 'a'
    killPoints.dataset.pop = state.toggle
  }
}

/**
 * **Acrescenta, e não reescreve a lista.** Os toasts que já estão no ar
 * continuam a própria animação até sumirem sozinhos; recriá-los aqui faria
 * cada um voltar ao começo a cada medalha nova.
 */
function writeMedalFeed(root: HTMLElement, awards: readonly MedalAward[]): void {
  if (awards.length === 0) return
  // a kill nova troca a fila da anterior, e não entra atrás dela: a medalha que
  // o jogador acabou de ganhar é a que importa, e esperar a fila velha a
  // mostraria segundos depois do tiro.
  root.replaceChildren(...medalToasts(awards).map((toast, index) => medalNode(root, toast, index)))
}

function medalNode(root: HTMLElement, toast: MedalToast, index: number): HTMLElement {
  const node = root.ownerDocument.createElement('div')
  node.className = 'medal-toast'
  node.dataset.rarity = toast.rarity
  // a fila é atraso de css: até a vez dele, o toast está no quadro 0%, que é
  // invisível. é o que permite uma medalha de cada vez sem relógio nenhum.
  node.style.animationDelay = `${toastDelayMs(index)}ms`
  // o css não enxerga o `src` de um `img`, e as camadas de luz precisam dele
  // para se recortar na **silhueta do escudo** em vez de num quadrado. só
  // metade da caixa do ícone é arte; a outra metade é transparência, e foi por
  // ela que a primeira versão deste efeito passou reto.
  node.style.setProperty('--medal-src', `url(${toast.iconUrl})`)
  node.append(medalIcon(root, toast), medalSheen(root))
  return node
}

/**
 * A camada de brilho que corre sobre o metal. Nó próprio e não pseudo-elemento
 * porque o toast já gasta os dois: `::before` é o que fica atrás da medalha e
 * `::after` é o clarão por cima dela.
 */
function medalSheen(root: HTMLElement): HTMLElement {
  const sheen = root.ownerDocument.createElement('span')
  sheen.className = 'medal-sheen'
  sheen.ariaHidden = 'true'
  return sheen
}

function medalIcon(root: HTMLElement, toast: MedalToast): HTMLElement {
  const icon = root.ownerDocument.createElement('img')
  icon.className = 'medal-icon'
  icon.src = toast.iconUrl
  // o nome **é** o alt, e não um parágrafo ao lado: na tela a arte já o traz
  // embutido, e no `aria-live` do feed o alt é a única coisa que sobra para
  // anunciar. `#hud-killpoints` é `aria-hidden`, então sem isto a medalha não
  // seria dita em lugar nenhum.
  icon.alt = toast.label
  return icon
}

/** Uma linha do registro da retícula: o nome do que rendeu os pontos. */
function medalTally(root: HTMLElement, label: string): HTMLElement {
  const line = root.ownerDocument.createElement('span')
  line.className = 'killpoints-medal'
  line.textContent = label
  return line
}
