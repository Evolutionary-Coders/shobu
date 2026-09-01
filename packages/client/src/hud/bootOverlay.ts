/**
 * A tela de entrada, em dom sobre o canvas (ADR 0001). Ela é o pilar 2 na
 * prática: um clique, nenhuma escolha, nenhum lobby.
 */
export interface BootOverlay {
  announceReady(): void
  announceFailure(reason: unknown): void
  reportTimeToControl(description: string): void
  setInGame(inGame: boolean): void
  onEnterRequested(listener: () => void): void
}

export function createBootOverlay(root: ParentNode): BootOverlay {
  const overlay = requireElement<HTMLElement>(root, '#boot-overlay')
  const status = requireElement<HTMLElement>(root, '#boot-status')
  const hint = requireElement<HTMLElement>(root, '#boot-hint')
  const timer = requireElement<HTMLElement>(root, '#boot-timer')
  const crosshair = requireElement<HTMLElement>(root, '#crosshair')

  return {
    announceReady: () => announce(status, hint, 'arena carregada'),
    announceFailure: (reason) => fail(overlay, status, reason),
    reportTimeToControl: (description) => {
      timer.textContent = description
    },
    setInGame: (inGame) => toggleInGame(overlay, crosshair, inGame),
    onEnterRequested: (listener) => overlay.addEventListener('click', listener),
  }
}

function announce(status: HTMLElement, hint: HTMLElement, message: string): void {
  status.textContent = message
  hint.hidden = false
}

function fail(overlay: HTMLElement, status: HTMLElement, reason: unknown): void {
  overlay.dataset.state = 'failed'
  status.textContent = reason instanceof Error ? reason.message : String(reason)
}

function toggleInGame(overlay: HTMLElement, crosshair: HTMLElement, inGame: boolean): void {
  overlay.hidden = inGame
  crosshair.hidden = !inGame
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (element) return element
  throw new Error(`querySelector('${selector}') não achou nada; esperado um elemento no index.html`)
}
