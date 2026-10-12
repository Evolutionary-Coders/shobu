import { type ElementQuery, requireElement } from './requireElement.ts'

/**
 * A legenda do narrador no dom: escreve o texto, ou esconde a linha. Quem
 * decide o quê e até quando é `narratorCaptions.ts`; isto só escreve.
 *
 * No óculos a linha some (`setSuppressed`): o dom é uma imagem só, e o óculos
 * desenha duas — a legenda de lá é a do visor (`headsetVisor.ts`).
 */
export interface CaptionLine {
  write(text: string | null): void
  setSuppressed(suppressed: boolean): void
}

/**
 * ```ts
 * const line = createCaptionLine(document)
 * narrator.captions.subscribe(line.write)
 * ```
 */
export function createCaptionLine(root: ElementQuery): CaptionLine {
  const node = requireElement<HTMLElement>(root, '#narrator-caption')
  const state = { text: null as string | null, suppressed: false }
  const render = (): void => {
    node.hidden = state.text === null || state.suppressed
    if (state.text !== null) node.textContent = state.text
  }
  return {
    write: (text) => {
      state.text = text
      render()
    },
    setSuppressed: (suppressed) => {
      state.suppressed = suppressed
      render()
    },
  }
}
