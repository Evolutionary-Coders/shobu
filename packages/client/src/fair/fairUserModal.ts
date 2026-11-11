// o estilo vai com o modal, como o do selo (fairBadge.ts).
import './fairUserModal.css'
import { type FairModalAction, fairModalOutcome } from './fairModalChoice.ts'

/**
 * O modal que pede o ID da Feira ao abrir o jogo (ADR 0037). Quem decide o
 * que cada botão faz é `fairModalOutcome`; aqui só o dom.
 */
export interface FairUserModal {
  /** Abre com `current` no campo (vazio com `null`) e o foco nele. */
  open(current: number | null): void
  /** Fecha sem escolher: o jogador entrou no jogo por baixo (o controle). */
  dismiss(): void
  /** O ID escolhido, ou `null` para quem escolheu jogar sem. */
  onChoose(listener: (userId: number | null) => void): void
}

interface ModalParts {
  readonly root: HTMLElement
  readonly input: HTMLInputElement
  readonly error: HTMLElement
}

/**
 * O modal no fim de `parent`, fechado. Aberto, ele é dono do teclado: toda
 * tecla para na captura da janela, antes do menu e do jogo, que escutam o
 * documento. Sem isso, o ENTER e as setas dirigiam o menu por baixo do modal,
 * e a partida começava com ele na frente (review do PR #49). A tecla digitada
 * fora do campo devolve o foco a ele.
 *
 * ```ts
 * const modal = mountFairUserModal(document.body)
 * modal.onChoose((userId) => relay.chooseUser(userId))
 * modal.open(null)
 * ```
 */
export function mountFairUserModal(parent: HTMLElement): FairUserModal {
  const parts = createModalParts(parent)
  const listeners: ((userId: number | null) => void)[] = []
  let current: number | null = null
  wireModalActions(parts, (action) => {
    const outcome = fairModalOutcome(action, current)
    if ('error' in outcome) {
      parts.error.textContent = outcome.error
      return
    }
    parts.root.hidden = true
    for (const listener of listeners) listener(outcome.close)
  })
  return {
    open: (userId) => {
      current = userId
      parts.input.value = userId === null ? '' : String(userId)
      parts.error.textContent = ''
      parts.root.hidden = false
      parts.input.focus()
    },
    dismiss: () => {
      parts.root.hidden = true
    },
    onChoose: (listener) => void listeners.push(listener),
  }
}

function wireModalActions(parts: ModalParts, act: (action: FairModalAction) => void): void {
  const { root, input } = parts
  root.querySelector('form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    act({ kind: 'confirm', text: input.value })
  })
  root.querySelector('.fair-modal-skip')?.addEventListener('click', () => act({ kind: 'skip' }))
  const view = root.ownerDocument.defaultView
  const holdKey = (event: KeyboardEvent) => {
    if (root.hidden) return
    event.stopPropagation()
    if (event.type === 'keydown' && event.code === 'Escape') act({ kind: 'cancel' })
    else if (!root.contains(event.target as Node)) input.focus()
  }
  view?.addEventListener('keydown', holdKey, { capture: true })
  view?.addEventListener('keyup', holdKey, { capture: true })
}

function createModalParts(parent: HTMLElement): ModalParts {
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
  const input = root.querySelector('input') as HTMLInputElement
  const error = root.querySelector('.fair-modal-error') as HTMLElement
  return { root, input, error }
}
