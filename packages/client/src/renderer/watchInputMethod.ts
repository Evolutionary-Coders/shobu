import type { Scene } from '@babylonjs/core/scene'
import {
  createInputMethodTracker,
  type InputMethodTracker,
  noteGamepad,
  noteKeyboard,
  notePointer,
} from '../controller/lastInputMethod.ts'

/**
 * A última entrada usada, para as dicas da tela (`bladeHint.ts`). Adapter: ouve
 * tecla, ponteiro e roda no documento, e lê o controle a cada quadro; quem
 * decide quem vence é `lastInputMethod.ts`.
 *
 * O `mousemove` fica de fora de propósito: o mouse esbarrado na mesa trocaria a
 * dica do controle pela do teclado no meio da partida.
 *
 * ```ts
 * const inputMethod = watchInputMethod(scene, canvas.ownerDocument)
 * inputMethod.method // 'gamepad' depois do primeiro botão do controle
 * ```
 */
export function watchInputMethod(scene: Scene, document: Document): InputMethodTracker {
  const tracker = createInputMethodTracker()
  document.addEventListener('keydown', () => noteKeyboard(tracker), { capture: true })
  document.addEventListener('wheel', () => noteKeyboard(tracker), { capture: true, passive: true })
  document.addEventListener('pointerdown', (event) => notePointer(tracker, event.pointerType), {
    capture: true,
  })
  scene.onBeforeRenderObservable.add(() => {
    const pad = navigator.getGamepads?.().find((candidate) => candidate?.connected)
    noteGamepad(tracker, pad ?? undefined)
  })
  return tracker
}
