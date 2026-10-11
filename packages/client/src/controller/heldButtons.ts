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

/**
 * O pedaço de `PointerEvent` que este módulo usa. Estrutural: o teste roda em
 * node. `buttons` é a máscara do que está preso **agora** (1 esquerdo, 2
 * direito, 4 roda), e não o botão que mudou.
 */
export interface MouseButtonEvent {
  readonly buttons: number
  readonly pointerType: string
  preventDefault(): void
}

type MouseEventType = 'pointerdown' | 'pointermove' | 'pointerup' | 'contextmenu'

export interface MouseEventSource {
  addEventListener(type: MouseEventType, listener: (event: MouseButtonEvent) => void): void
  removeEventListener(type: MouseEventType, listener: (event: MouseButtonEvent) => void): void
}

/** O bit de cada ação na máscara `buttons`. A roda (4) não é ação do jogo. */
const ACTION_BY_BIT: readonly (readonly [number, WeaponAction])[] = [
  [1, 'fire'],
  [2, 'scope'],
]

export interface ButtonTracker {
  readonly buttons: HeldButtons
  dispose(): void
}

/**
 * Escuta no canvas, como o teclado, e lê os **eventos de ponteiro**, não os de
 * mouse. Com `mousedown`, o clique não chegava: o babylon também ouve o
 * canvas, e na validação da `dev` (10/10) o `pointerdown` chegava cancelado e
 * o `mousedown` nunca vinha — o tiro do mouse simplesmente não saía.
 *
 * A máscara `buttons` resolve de quebra o clique em acorde: o segundo botão
 * apertado com o primeiro preso **não** gera `pointerdown`, só `pointermove`
 * com a máscara nova, e por isso os três eventos passam pelo mesmo caminho.
 * O toque fica de fora: quem atira com o dedo é a camada de toque.
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
  const onPointer = (event: MouseButtonEvent): void => {
    if (event.pointerType !== 'touch') syncHeld(buttons, event)
  }
  const onContextMenu = (event: MouseButtonEvent): void => event.preventDefault()
  const listeners: readonly [MouseEventType, (event: MouseButtonEvent) => void][] = [
    ['pointerdown', onPointer],
    ['pointermove', onPointer],
    ['pointerup', onPointer],
    ['contextmenu', onContextMenu],
  ]
  for (const [type, listener] of listeners) source.addEventListener(type, listener)
  return {
    buttons,
    dispose: () => {
      for (const [type, listener] of listeners) source.removeEventListener(type, listener)
    },
  }
}

/** Só o que mudou passa por `holdButton`: o `pointermove` chega a cada pixel de mira. */
function syncHeld(buttons: HeldButtons, event: MouseButtonEvent): void {
  let changed = false
  for (const [bit, action] of ACTION_BY_BIT) {
    const held = (event.buttons & bit) !== 0
    if (held === buttons[action]) continue
    holdButton(buttons, action, held)
    changed = true
  }
  if (changed) event.preventDefault()
}

/**
 * Prende ou solta uma ação de arma, armando a trava de aperto não lido na
 * descida. É o caminho de todo dispositivo — mouse e gamepad —, para que o
 * clique curto entre dois ticks sobreviva igual nos dois.
 *
 * ```ts
 * holdButton(buttons, 'fire', true) // fire e firePressedUnread ficam true
 * ```
 */
export function holdButton(buttons: HeldButtons, action: WeaponAction, held: boolean): void {
  buttons[action] = held
  if (held) buttons[unreadKeyOf(action)] = true
}
