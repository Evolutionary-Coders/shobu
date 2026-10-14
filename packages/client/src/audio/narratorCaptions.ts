/**
 * As legendas do narrador: toda fala aparece escrita, com o texto exato do
 * take que tocou, **pelo tempo que ela dura** — e some quando a fala acaba ou
 * quando outra a corta.
 *
 * O texto vem do manifesto da voz (`narratorManifest.ts`, campo `text` de cada
 * take), que a bancada escreve a partir de `scripts/narrator/lines.md`. Nada
 * aqui repete frase à mão: uma voz nova, com o manifesto no mesmo formato,
 * ganha legenda sem mexer em código.
 *
 * **O tempo é o do áudio**, e não uma estimativa: o mixer avisa quando a fala
 * começou a soar e quando parou (`SpeechCue`), cortada ou não. A fila do
 * narrador (`narratorQueue.ts`) estima a duração para decidir quem fala; a
 * legenda não precisa estimar nada.
 *
 * ```ts
 * const captions = createNarratorCaptions()
 * captions.subscribe((text) => captionLine.write(text))
 * mixer.speak(url, captions.cueFor(take.text))
 * ```
 */

/** O que o mixer avisa de uma fala: começou a soar, e parou — no fim ou cortada. */
export interface SpeechCue {
  started(): void
  ended(): void
}

/** Quem desenha a legenda: o texto a mostrar, ou `null` para apagar. */
export type CaptionListener = (text: string | null) => void

export interface NarratorCaptions {
  /** O aviso de uma fala com este texto. Uma por fala: é o que separa a cortada da que a cortou. */
  cueFor(text: string): SpeechCue
  /** O ajuste LEGENDAS do menu. Desligar apaga a que estiver na tela. */
  setEnabled(enabled: boolean): void
  subscribe(listener: CaptionListener): void
}

interface CaptionState {
  /** A fala que está soando, pelo número dela, e o texto; `0` é nenhuma. */
  speaking: number
  text: string | null
  enabled: boolean
  issued: number
}

export function createNarratorCaptions(): NarratorCaptions {
  const state: CaptionState = { speaking: 0, text: null, enabled: true, issued: 0 }
  const listeners: CaptionListener[] = []
  const emit = (): void => {
    const shown = state.enabled ? state.text : null
    for (const listener of listeners) listener(shown)
  }
  return {
    cueFor: (text) => {
      state.issued += 1
      return cueOf(state, state.issued, text, emit)
    },
    setEnabled: (enabled) => {
      if (enabled === state.enabled) return
      state.enabled = enabled
      emit()
    },
    subscribe: (listener) => {
      listeners.push(listener)
    },
  }
}

/** O aviso da fala de número `line`: mostra ao começar, e só apaga se ainda for ela. */
function cueOf(state: CaptionState, line: number, text: string, emit: () => void): SpeechCue {
  return {
    started: () => {
      state.speaking = line
      // take sem texto não mostra caixa vazia.
      state.text = text.trim() === '' ? null : text
      emit()
    },
    ended: () => {
      // a fala cortada avisa que parou **depois** que a nova já começou: o
      // aviso dela não pode apagar a legenda da outra.
      if (state.speaking !== line) return
      state.speaking = 0
      state.text = null
      emit()
    },
  }
}
