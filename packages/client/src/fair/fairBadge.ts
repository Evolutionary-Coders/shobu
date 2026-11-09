// o estilo vai com o selo: o index.html está no teto de linhas, e o selo é
// a única coisa que o usa.
import './fairBadge.css'

/**
 * O selo da Feira de Jogos no canto da tela (ADR 0036): no menu, o botão do
 * Google ou a conta que entrou; no fim da partida, a linha do crédito por
 * alguns segundos. Fica fora do menu e do hud de propósito: aparece nos dois,
 * e nenhum deles precisa saber da Feira.
 */
export interface FairBadge {
  /** Onde o botão do Google é desenhado. */
  readonly buttonSlot: HTMLElement
  /** O menu está na tela: mostra a conta, ou o botão. */
  setMenuVisible(visible: boolean): void
  /** Quem entrou com o Google; esconde o botão. */
  setAccount(name: string): void
  /** A linha do crédito do fim da partida, que some sozinha. */
  showCredit(text: string): void
}

/** Tempo da linha do crédito na tela: cobre o pódio e o voto do intervalo. */
const CREDIT_SHOWN_MS = 15_000

/**
 * ```ts
 * const badge = mountFairBadge(document.body)
 * badge.setAccount('Ana')
 * ```
 */
export function mountFairBadge(parent: HTMLElement): FairBadge {
  const root = createBadgeRoot(parent)
  const part = (selector: string) => root.querySelector(selector) as HTMLElement
  const name = part('.fair-name')
  const credit = part('.fair-credit')
  let creditTimer: ReturnType<typeof setTimeout> | undefined
  return {
    buttonSlot: part('.fair-button'),
    setMenuVisible: (visible) => {
      root.dataset.menu = String(visible)
    },
    setAccount: (account) => {
      name.textContent = account
      root.dataset.account = 'signed-in'
    },
    showCredit: (text) => {
      credit.textContent = text
      root.dataset.credit = 'shown'
      clearTimeout(creditTimer)
      creditTimer = setTimeout(() => root.removeAttribute('data-credit'), CREDIT_SHOWN_MS)
    },
  }
}

/** O selo no fim de `parent`, com o menu na tela e ninguém logado. */
function createBadgeRoot(parent: HTMLElement): HTMLElement {
  const root = parent.ownerDocument.createElement('aside')
  root.id = 'fair-badge'
  root.setAttribute('aria-label', 'Feira de Jogos')
  root.innerHTML = `
    <p class="fair-account"><span class="fair-tag">FEIRA</span> <span class="fair-name"></span></p>
    <p class="fair-hint">Entre com o Google para ganhar tijolinhos</p>
    <div class="fair-button"></div>
    <p class="fair-credit" aria-live="polite"></p>`
  root.dataset.menu = 'true'
  root.dataset.account = 'none'
  parent.append(root)
  return root
}
