/**
 * Os botões do mouse como estado, não como evento — o mesmo desenho do
 * `heldKeys.ts`, e pelo mesmo motivo: o núcleo roda em tick fixo e pergunta "o
 * que está preso agora?", e é o núcleo quem lê a borda contra o tick anterior.
 */
export interface HeldButtons {
  fire: boolean
  scope: boolean
  /**
   * Apertos que nenhum tick leu ainda.
   *
   * O núcleo roda em tick fixo e lê "o que está preso agora?". Um clique que
   * desce e sobe **entre dois ticks** nunca estaria preso em nenhum deles, e o
   * tiro sumiria — num quadro de 16 ms é raro, mas num quadro de 50 ms, que é
   * o que uma máquina ruim na feira entrega, deixa de ser.
   *
   * Com a trava, o aperto sobrevive até um tick o ler, e o núcleo vê uma borda
   * limpa de um tick.
   */
  firePressedUnread: boolean
  scopePressedUnread: boolean
}

export type WeaponAction = 'fire' | 'scope'

/** `MouseEvent.button`: 0 é o esquerdo, 2 é o direito. O 1 (roda) não é ação do jogo. */
const ACTION_BY_BUTTON: Readonly<Record<number, WeaponAction>> = {
  0: 'fire',
  2: 'scope',
}

export function actionForMouseButton(button: number): WeaponAction | undefined {
  return ACTION_BY_BUTTON[button]
}

export function createHeldButtons(): HeldButtons {
  return { fire: false, scope: false, firePressedUnread: false, scopePressedUnread: false }
}

/** Lê e apaga a trava de aperto. Devolve se havia um aperto ainda não lido. */
export function takePress(buttons: HeldButtons, action: WeaponAction): boolean {
  const key = unreadKeyOf(action)
  const pressed = buttons[key]
  buttons[key] = false
  return pressed
}

export function releaseAllButtons(buttons: HeldButtons): void {
  buttons.fire = false
  buttons.scope = false
  // perder o ponteiro travado não pode deixar um tiro pendurado esperando o
  // jogador voltar.
  buttons.firePressedUnread = false
  buttons.scopePressedUnread = false
}

function unreadKeyOf(action: WeaponAction): 'firePressedUnread' | 'scopePressedUnread' {
  return action === 'fire' ? 'firePressedUnread' : 'scopePressedUnread'
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
  if (held) buttons[unreadKeyOf(action)] = true
}
