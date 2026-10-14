import type { Scene } from '@babylonjs/core/scene'
import { firstConnectedPad } from '../controller/connectedGamepad.ts'
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
  const pads = countConnectedPads(document)
  scene.onBeforeRenderObservable.add(() => {
    // `getGamepads` devolve um vetor novo a cada chamada: sem controle
    // conectado, o quadro não pergunta — e o navegador só expõe o controle
    // depois do primeiro botão, que é quando o `gamepadconnected` chega.
    if (pads.connected === 0) return
    noteGamepad(tracker, firstConnectedPad(navigator.getGamepads?.()))
  })
  return tracker
}

function countConnectedPads(document: Document): { connected: number } {
  const pads = { connected: 0 }
  const view = document.defaultView
  view?.addEventListener('gamepadconnected', () => {
    pads.connected += 1
  })
  view?.addEventListener('gamepaddisconnected', () => {
    pads.connected = Math.max(0, pads.connected - 1)
  })
  return pads
}
