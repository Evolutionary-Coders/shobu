/**
 * O teclado como estado, não como evento: o núcleo roda em tick fixo e
 * pergunta "o que está preso agora?", enquanto o navegador entrega descidas e
 * subidas em tempo próprio. Este módulo faz a ponte.
 *
 * As ações de teclado: movimentação, gancho, recarga e o placar. Tiro e mira
 * são botão de mouse e moram em `heldButtons.ts`. O gancho é tecla presa, como
 * o pulo, e não aperto travado como o tiro: segurar é o que mantém a corda.
 */
export interface HeldKeys {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  sprint: boolean
  jump: boolean
  crouch: boolean
  grapple: boolean
  reload: boolean
  /** A tecla do corpo a corpo (V): tocar golpeia, segurar empunha a lâmina (ADR 0021). */
  melee: boolean
  /**
   * Voltar à sniper (tecla 1, ↑ do direcional no controle). A roda do mouse e o
   * toque no botão da lâmina fazem o mesmo, pela trava de `heldButtons.ts`.
   */
  primary: boolean
  /** O placar do tab: aparece enquanto a tecla está presa, como em todo fps de arena. */
  scoreboard: boolean
}

export type MovementAction = keyof HeldKeys

/**
 * `KeyboardEvent.code` e não `key`: é a posição física, então wasd continua
 * wasd num teclado azerty ou abnt. Agachar e slide no **C** e não no ctrl:
 * ctrl+w com o jogador correndo para a frente fecha a aba, e nenhum layout de
 * tecla vale isso.
 *
 * O gancho no **Q**, a tecla de habilidade do titanfall e do apex: fica sob o
 * indicador esquerdo sem soltar o W. O corpo a corpo no **V**, o melee do call
 * of duty, sob o polegar que já está no espaço; e a sniper de volta no **1**,
 * a tecla da arma principal de todo fps.
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
  KeyQ: 'grapple',
  KeyR: 'reload',
  KeyV: 'melee',
  Digit1: 'primary',
  // o tab é do jogo com o jogador no controle: o `preventDefault` de `setHeld`
  // é o que impede o navegador de levar o foco para fora do canvas.
  Tab: 'scoreboard',
}

/**
 * ```ts
 * actionForKeyCode('KeyW') // 'forward'
 * actionForKeyCode('KeyQ') // 'grapple'
 * actionForKeyCode('KeyZ') // undefined
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
    grapple: false,
    reload: false,
    melee: false,
    primary: false,
    scoreboard: false,
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
 * `onPressed` ouve a **descida** de cada tecla do jogo. É para quem precisa do
 * aperto e não do estado: a tecla 1 tocada rápido desce e sobe entre dois
 * ticks, e "preso agora?" nunca a via — a volta à sniper sumia (11/10).
 *
 * ```ts
 * const tracker = trackHeldKeys(canvas, (action) => action === 'primary' && latchPrimaryPress(buttons))
 * tracker.keys.forward // true enquanto W estiver preso
 * ```
 */
export function trackHeldKeys(
  source: KeyEventSource,
  onPressed: (action: MovementAction) => void = () => {},
): KeyTracker {
  const keys = createHeldKeys()
  const onKeyDown = (event: KeyboardEvent): void => {
    const action = setHeld(keys, event, true)
    if (action) onPressed(action)
  }
  const onKeyUp = (event: KeyboardEvent): void => void setHeld(keys, event, false)
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
function setHeld(keys: HeldKeys, event: KeyboardEvent, held: boolean): MovementAction | undefined {
  const action = actionForKeyCode(event.code)
  if (!action) return undefined
  event.preventDefault()
  keys[action] = held
  return action
}
