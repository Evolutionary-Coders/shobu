import { type ElementQuery, requireElement } from './requireElement.ts'

/**
 * CLIQUE PARA ENTRAR: o aviso que o boot mostra quando a página recarregou
 * para a partida seguinte num outro mapa (`rematch.ts`). O ponteiro travado
 * exige um gesto, e o aviso é o lugar do gesto — por cima do menu, que
 * continua atrás para quem preferir voltar a ele (Esc ou B).
 */
export interface RematchPrompt {
  show(arenaLabel: string): void
  hide(): void
  /** O clique ou o toque no aviso, com o tipo de ponteiro do evento. */
  onActivate(listener: (pointerType: string | undefined) => void): void
}

/**
 * ```ts
 * const prompt = createRematchPrompt(document)
 * prompt.show('ICHIBAN-GAI')
 * ```
 */
export function createRematchPrompt(root: ElementQuery): RematchPrompt {
  const prompt = requireElement<HTMLElement>(root, '#rematch-prompt')
  const arena = requireElement<HTMLElement>(root, '.rematch-arena')
  return {
    show: (arenaLabel) => {
      arena.textContent = arenaLabel
      prompt.hidden = false
    },
    hide: () => {
      prompt.hidden = true
    },
    onActivate: (listener) => {
      prompt.addEventListener('click', (event) => {
        // o clique não pode descer ao menu atrás: lá ele seria uma linha escolhida.
        event.stopPropagation()
        listener(event instanceof PointerEvent ? event.pointerType : undefined)
      })
    },
  }
}
