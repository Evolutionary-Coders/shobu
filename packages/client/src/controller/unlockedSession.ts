/**
 * Jogar no desktop só com o controle (xbox, playstation ou o do projeto).
 *
 * O navegador só trava o ponteiro dentro de um gesto de mouse ou teclado — o
 * botão de um gamepad não conta —, então quem entra pelo controle não ganha
 * ponteiro travado. Esta sessão é o "jogador no controle" dele: começa quando o
 * menu é confirmado pelo gamepad, e termina no START, que volta ao menu.
 */
export interface GamepadSession {
  readonly active: boolean
  enter(): void
  exit(): void
  onChange(listener: (active: boolean) => void): void
}

/**
 * ```ts
 * const session = createGamepadSession()
 * session.onChange((active) => hud.setVisible(active))
 * session.enter() // o menu foi confirmado com A
 * ```
 */
export function createGamepadSession(): GamepadSession {
  const listeners = new Set<(active: boolean) => void>()
  let active = false
  const set = (next: boolean): void => {
    if (next === active) return
    active = next
    for (const listener of listeners) listener(active)
  }
  return {
    get active() {
      return active
    },
    enter: () => set(true),
    exit: () => set(false),
    onChange: (listener) => void listeners.add(listener),
  }
}
