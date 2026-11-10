import { fairUserIdOf } from '@shobu/core'
// o estilo vai com o modal, como o do selo (fairBadge.ts).
import './fairUserModal.css'

/**
 * O modal que pede o ID da Feira ao abrir o jogo (ADR 0037). Confirmar só
 * aceita um ID com forma de ID; jogar sem ID também é escolha, e fecha.
 */
export interface FairUserModal {
  /** Abre com `current` no campo (vazio com `null`) e o foco nele. */
  open(current: number | null): void
  /** O ID confirmado, ou `null` para quem escolheu jogar sem. */
  onChoose(listener: (userId: number | null) => void): void
}

const INVALID_ID_TEXT = 'DIGITE SÓ OS NÚMEROS DO SEU ID DA FEIRA'

/**
 * O modal no fim de `parent`, fechado. As teclas digitadas nele param nele: o
 * menu escuta o documento, e o ENTER que confirma o ID seria também o
 * "confirmar" da linha do menu embaixo, como no campo do nome (`bootMenu.ts`).
 *
 * ```ts
 * const modal = mountFairUserModal(document.body)
 * modal.onChoose((userId) => relay.chooseUser(userId))
 * modal.open(null)
 * ```
 */
export function mountFairUserModal(parent: HTMLElement): FairUserModal {
  const root = createModalRoot(parent)
  const input = root.querySelector('input') as HTMLInputElement
  const error = root.querySelector('.fair-modal-error') as HTMLElement
  const listeners: ((userId: number | null) => void)[] = []
  const close = (userId: number | null) => {
    root.hidden = true
    for (const listener of listeners) listener(userId)
  }
  wireModalChoices(root, close)
  return {
    open: (current) => {
      input.value = current === null ? '' : String(current)
      error.textContent = ''
      root.hidden = false
      input.focus()
    },
    onChoose: (listener) => {
      listeners.push(listener)
    },
  }
}

/** Confirmar com um ID que não tem forma de ID só mostra o erro e deixa o modal aberto. */
function wireModalChoices(root: HTMLElement, close: (userId: number | null) => void): void {
  const input = root.querySelector('input') as HTMLInputElement
  const error = root.querySelector('.fair-modal-error') as HTMLElement
  root.querySelector('form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const userId = fairUserIdOf(input.value)
    if (userId === undefined) error.textContent = INVALID_ID_TEXT
    else close(userId)
  })
  root.querySelector('.fair-modal-skip')?.addEventListener('click', () => close(null))
  keepKeysInside(root, () => close(null))
}

/** Nenhuma tecla do modal chega ao menu nem ao jogo; o ESC é "jogar sem ID". */
function keepKeysInside(root: HTMLElement, onEscape: () => void): void {
  root.addEventListener('keydown', (event) => {
    event.stopPropagation()
    if (event.code === 'Escape') onEscape()
  })
  root.addEventListener('keyup', (event) => event.stopPropagation())
}

function createModalRoot(parent: HTMLElement): HTMLElement {
  const root = parent.ownerDocument.createElement('div')
  root.id = 'fair-modal'
  root.hidden = true
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'fair-modal-title')
  root.innerHTML = `
    <form class="fair-modal-panel" novalidate>
      <h2 id="fair-modal-title"><span class="fair-modal-tag">FEIRA DE JOGOS</span></h2>
      <p>Coloque seu ID da Feira para ganhar tijolinhos jogando.</p>
      <input name="fairUserId" inputmode="numeric" autocomplete="off" spellcheck="false"
        placeholder="SEU ID" aria-label="ID da Feira" aria-describedby="fair-modal-error">
      <p class="fair-modal-error" id="fair-modal-error" aria-live="polite"></p>
      <div class="fair-modal-actions">
        <button type="submit" class="fair-modal-confirm">CONFIRMAR</button>
        <button type="button" class="fair-modal-skip">JOGAR SEM ID</button>
      </div>
    </form>`
  parent.append(root)
  return root
}
