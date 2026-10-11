/**
 * Jogar sem o ponteiro travado: só com o controle (xbox, playstation ou o do
 * projeto), ou com o toque, no celular.
 *
 * O navegador só trava o ponteiro dentro de um gesto de mouse ou teclado — o
 * botão de um gamepad não conta —, e o chrome do android não trava ponteiro
 * nenhum. Quem entra por um desses dois não ganha trava, e esta sessão é o
 * "jogador no controle" dele: começa quando o menu é confirmado, e termina na
 * pausa (START, esc ou o botão de pausa da tela de toque).
 */
export type UnlockedInput = 'gamepad' | 'touch'

export interface UnlockedSession {
  readonly active: boolean
  /** Por onde o jogador entrou; `undefined` fora da sessão. */
  readonly input: UnlockedInput | undefined
  enter(input: UnlockedInput): void
  exit(): void
  onChange(listener: (active: boolean) => void): void
}

/**
 * ```ts
 * const session = createUnlockedSession()
 * session.onChange((active) => hud.setVisible(active))
 * session.enter('gamepad') // o menu foi confirmado com A
 * ```
 */
export function createUnlockedSession(): UnlockedSession {
  const listeners = new Set<(active: boolean) => void>()
  let input: UnlockedInput | undefined
  // trocar de entrada com a sessão aberta também avisa: quem escuta relê
  // `input` (a camada de toque só aparece na sessão de toque).
  const set = (next: UnlockedInput | undefined): void => {
    if (next === input) return
    input = next
    for (const listener of listeners) listener(input !== undefined)
  }
  return {
    get active() {
      return input !== undefined
    },
    get input() {
      return input
    },
    enter: (next) => set(next),
    exit: () => set(undefined),
    onChange: (listener) => void listeners.add(listener),
  }
}
