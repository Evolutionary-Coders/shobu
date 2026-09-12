/**
 * Os botões do mouse como estado, não como evento — o mesmo desenho do
 * `heldKeys.ts`, e pelo mesmo motivo: o núcleo roda em tick fixo e pergunta "o
 * que está preso agora?", e é o núcleo quem lê a borda contra o tick anterior.
 */
export interface HeldButtons {
  fire: boolean
  scope: boolean
}

export type WeaponAction = keyof HeldButtons

/** `MouseEvent.button`: 0 é o esquerdo, 2 é o direito. O 1 (roda) não é ação do jogo. */
const ACTION_BY_BUTTON: Readonly<Record<number, WeaponAction>> = {
  0: 'fire',
  2: 'scope',
}

export function actionForMouseButton(button: number): WeaponAction | undefined {
  return ACTION_BY_BUTTON[button]
}

export function createHeldButtons(): HeldButtons {
  return { fire: false, scope: false }
}

export function releaseAllButtons(buttons: HeldButtons): void {
  for (const action of Object.keys(buttons) as WeaponAction[]) buttons[action] = false
}

/** O pedaço de `MouseEvent` que este módulo usa. Estrutural: o teste roda em node. */
export interface MouseButtonEvent {
  readonly button: number
  preventDefault(): void
}

export interface MouseEventSource {
  addEventListener(
    type: 'mousedown' | 'mouseup' | 'contextmenu',
    listener: (event: MouseButtonEvent) => void,
  ): void
  removeEventListener(
    type: 'mousedown' | 'mouseup' | 'contextmenu',
    listener: (event: MouseButtonEvent) => void,
  ): void
}

export interface ButtonTracker {
  readonly buttons: HeldButtons
  dispose(): void
}

/**
 * Escuta no canvas, como o teclado.
 *
 * **Sem ouvinte de `blur`**: o sinal de soltura do mouse é perder o ponteiro
 * travado, e `createPlayerControlNotifier` já existe para isso. O menu de
 * contexto é bloqueado **sempre**, porque um menu do navegador aberto sobre um
 * ponteiro travado é jogo morto.
 *
 * ```ts
 * const tracker = trackHeldButtons(canvas)
 * tracker.buttons.fire // true enquanto o botão esquerdo estiver preso
 * ```
 */
export function trackHeldButtons(source: MouseEventSource): ButtonTracker {
  const buttons = createHeldButtons()
  const onMouseDown = (event: MouseButtonEvent): void => setHeld(buttons, event, true)
  const onMouseUp = (event: MouseButtonEvent): void => setHeld(buttons, event, false)
  const onContextMenu = (event: MouseButtonEvent): void => event.preventDefault()
  source.addEventListener('mousedown', onMouseDown)
  source.addEventListener('mouseup', onMouseUp)
  source.addEventListener('contextmenu', onContextMenu)
  return {
    buttons,
    dispose: () => {
      source.removeEventListener('mousedown', onMouseDown)
      source.removeEventListener('mouseup', onMouseUp)
      source.removeEventListener('contextmenu', onContextMenu)
    },
  }
}

function setHeld(buttons: HeldButtons, event: MouseButtonEvent, held: boolean): void {
  const action = actionForMouseButton(event.button)
  if (!action) return
  event.preventDefault()
  buttons[action] = held
}
