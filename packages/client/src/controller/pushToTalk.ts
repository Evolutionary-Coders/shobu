import type { KeyEventSource } from './heldKeys.ts'

/**
 * Fala enquanto o V estiver preso. `code`, e não `key`, pelo mesmo motivo de
 * `heldKeys.ts`: posição física, igual em qualquer layout.
 */
export const TALK_KEY_CODE = 'KeyV'

/**
 * Push-to-talk: `talk(true)` na descida do V, `talk(false)` na subida ou ao
 * perder o foco, senão o microfone fica aberto com a tecla solta fora da
 * janela. A repetição automática do teclado não chama de novo.
 *
 * ```ts
 * const dispose = bindPushToTalk(window, (on) => voice?.talk(on))
 * ```
 */
export function bindPushToTalk(source: KeyEventSource, talk: (on: boolean) => void): () => void {
  let talking = false
  const set = (on: boolean): void => {
    if (on === talking) return
    talking = on
    talk(on)
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === TALK_KEY_CODE) set(true)
  }
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === TALK_KEY_CODE) set(false)
  }
  const onBlur = (): void => set(false)
  source.addEventListener('keydown', onKeyDown)
  source.addEventListener('keyup', onKeyUp)
  source.addEventListener('blur', onBlur)
  return () => {
    source.removeEventListener('keydown', onKeyDown)
    source.removeEventListener('keyup', onKeyUp)
    source.removeEventListener('blur', onBlur)
  }
}
