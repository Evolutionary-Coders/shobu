/**
 * O teclado como estado, não como evento: o núcleo roda em tick fixo e
 * pergunta "o que está preso agora?", enquanto o navegador entrega descidas e
 * subidas em tempo próprio. Este módulo faz a ponte.
 *
 * Só as ações de movimentação; tiro, mira e gancho entram em outro módulo
 * quando existirem.
 */
export interface HeldKeys {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  sprint: boolean
  jump: boolean
  crouch: boolean
}

export type MovementAction = keyof HeldKeys

/**
 * `KeyboardEvent.code` e não `key`: é a posição física, então wasd continua
 * wasd num teclado azerty ou abnt. Agachar e slide no **C** e não no ctrl:
 * ctrl+w com o jogador correndo para a frente fecha a aba, e nenhum layout de
 * tecla vale isso.
 */
const ACTION_BY_CODE: Readonly<Record<string, MovementAction>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'jump',
  KeyC: 'crouch',
}

/**
 * ```ts
 * actionForKeyCode('KeyW') // 'forward'
 * actionForKeyCode('KeyQ') // undefined
 * ```
 */
export function actionForKeyCode(code: string): MovementAction | undefined {
  return ACTION_BY_CODE[code]
}

export function createHeldKeys(): HeldKeys {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    sprint: false,
    jump: false,
    crouch: false,
  }
}

/** Solta tudo. É o que acontece ao perder o foco, senão a tecla fica presa para sempre. */
export function releaseAll(keys: HeldKeys): void {
  for (const action of Object.keys(keys) as MovementAction[]) keys[action] = false
}

/** O pedaço de `EventTarget` que este módulo usa. Estrutural para o teste não precisar de dom. */
export interface KeyEventSource {
  addEventListener(type: 'keydown' | 'keyup', listener: (event: KeyboardEvent) => void): void
  addEventListener(type: 'blur', listener: () => void): void
  removeEventListener(type: 'keydown' | 'keyup', listener: (event: KeyboardEvent) => void): void
  removeEventListener(type: 'blur', listener: () => void): void
}

export interface KeyTracker {
  readonly keys: HeldKeys
  dispose(): void
}

/**
 * Escuta no canvas, não no documento: é o canvas que tem o foco durante a
 * partida (ver `focusForKeyboard` no adapter), e assim a tela de boot pode
 * continuar tratando as próprias teclas.
 *
 * ```ts
 * const tracker = trackHeldKeys(canvas)
 * tracker.keys.forward // true enquanto W estiver preso
 * ```
 */
export function trackHeldKeys(source: KeyEventSource): KeyTracker {
  const keys = createHeldKeys()
  const onKeyDown = (event: KeyboardEvent): void => setHeld(keys, event, true)
  const onKeyUp = (event: KeyboardEvent): void => setHeld(keys, event, false)
  const onBlur = (): void => releaseAll(keys)
  source.addEventListener('keydown', onKeyDown)
  source.addEventListener('keyup', onKeyUp)
  source.addEventListener('blur', onBlur)
  return {
    keys,
    dispose: () => {
      source.removeEventListener('keydown', onKeyDown)
      source.removeEventListener('keyup', onKeyUp)
      source.removeEventListener('blur', onBlur)
    },
  }
}

/**
 * `preventDefault` só nas teclas do jogo: espaço rola a página e as setas
 * também, e nenhum dos dois pode acontecer com o jogador no controle.
 */
function setHeld(keys: HeldKeys, event: KeyboardEvent, held: boolean): void {
  const action = actionForKeyCode(event.code)
  if (!action) return
  event.preventDefault()
  keys[action] = held
}
