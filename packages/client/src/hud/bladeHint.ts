import type { InputMethod } from '../controller/lastInputMethod.ts'

/**
 * A dica de volta à sniper com a lâmina na mão (pedido de 12/10: "coloca a dica
 * na tela"), no texto da entrada em uso. O toque não tem dica: o botão da
 * lâmina já vira 銃 SNIPER (`touchControls.ts`), e repetir isso seria ruído.
 */
const BLADE_HINT_TEXT: Readonly<Record<InputMethod, string | null>> = {
  keyboard: '1 / RODA — SNIPER',
  gamepad: 'D-PAD ↑ — SNIPER',
  touch: null,
}

/**
 * Quanto a dica fica na tela, do acender ao sumir. Casado com `blade-hint-a`/
 * `-b` em arenaPanels.css e com o visor do óculos: o bastante para ler duas
 * palavras de relance, e some antes de virar mobília.
 */
export const BLADE_HINT_MS = 3_500

/**
 * ```ts
 * bladeHintText('gamepad') // 'D-PAD ↑ — SNIPER'
 * ```
 */
export function bladeHintText(method: InputMethod): string | null {
  return BLADE_HINT_TEXT[method]
}

/** O que a tela já mostra: a lâmina e a entrada da última escrita. */
export interface BladeHintWatch {
  drawn: boolean
  method: InputMethod
}

export function createBladeHintWatch(): BladeHintWatch {
  return { drawn: false, method: 'keyboard' }
}

/**
 * O que escrever na tela neste quadro: `undefined` é nada a fazer, `null`
 * apaga, e um texto acende a dica **de novo** — a cada saque, e quando a
 * entrada troca com a lâmina na mão, que é quando a dica velha está errada.
 *
 * ```ts
 * const hint = stepBladeHint(watch, session.melee.bladeDrawn, tracker.method)
 * if (hint !== undefined) hud.setBladeHint(hint)
 * ```
 */
export function stepBladeHint(
  watch: BladeHintWatch,
  drawn: boolean,
  method: InputMethod,
): string | null | undefined {
  const wasDrawn = watch.drawn
  const changed = drawn !== wasDrawn || method !== watch.method
  watch.drawn = drawn
  watch.method = method
  if (!changed) return undefined
  if (drawn) return bladeHintText(method)
  return wasDrawn ? null : undefined
}
