// o estilo vai com o selo: o index.html está no teto de linhas, e o selo é
// a única coisa que o usa.
import './fairBadge.css'

/**
 * O selo da Feira de Jogos no canto da tela (ADR 0037): no menu, o ID da
 * Feira e o botão de trocá-lo; no fim da partida, a linha do crédito por
 * alguns segundos. Fica fora do menu e do hud de propósito: aparece nos dois,
 * e nenhum deles precisa saber da Feira.
 */
export interface FairBadge {
  /** O menu está na tela: mostra o ID e o botão. */
  setMenuVisible(visible: boolean): void
  /** O ID com que a aba joga, ou `null` sem ID. */
  setUser(userId: number | null): void
  /** A linha do crédito do fim da partida, que some sozinha. */
  showCredit(text: string): void
  /** O jogador pediu para colocar ou trocar o ID. */
  onChangeRequest(listener: () => void): void
}

/** Tempo da linha do crédito na tela: cobre o pódio e o voto do intervalo. */
const CREDIT_SHOWN_MS = 15_000

/**
 * ```ts
 * const badge = mountFairBadge(document.body)
 * badge.setUser(42)
 * ```
 */
export function mountFairBadge(parent: HTMLElement): FairBadge {
  const root = createBadgeRoot(parent)
  const part = (selector: string) => root.querySelector(selector) as HTMLElement
  const user = part('.fair-user')
  const change = part('.fair-change')
  const credit = part('.fair-credit')
  let creditTimer: ReturnType<typeof setTimeout> | undefined
  return {
    setMenuVisible: (visible) => {
      root.dataset.menu = String(visible)
    },
    setUser: (userId) => {
      user.textContent = userId === null ? 'SEM ID' : `ID ${userId}`
      change.textContent = userId === null ? 'COLOCAR ID' : 'TROCAR'
    },
    showCredit: (text) => {
      credit.textContent = text
      root.dataset.credit = 'shown'
      clearTimeout(creditTimer)
      creditTimer = setTimeout(() => root.removeAttribute('data-credit'), CREDIT_SHOWN_MS)
    },
    onChangeRequest: (listener) => {
      change.addEventListener('click', listener)
    },
  }
}

/** O selo no fim de `parent`, com o menu na tela e sem ID. */
function createBadgeRoot(parent: HTMLElement): HTMLElement {
  const root = parent.ownerDocument.createElement('aside')
  root.id = 'fair-badge'
  root.setAttribute('aria-label', 'Feira de Jogos')
  root.innerHTML = `
    <p class="fair-account">
      <span class="fair-tag">FEIRA</span> <span class="fair-user">SEM ID</span>
      <button type="button" class="fair-change">COLOCAR ID</button>
    </p>
    <p class="fair-credit" aria-live="polite"></p>`
  root.dataset.menu = 'true'
  parent.append(root)
  return root
}
