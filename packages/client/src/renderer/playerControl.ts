import type { UnlockedSession } from '../controller/unlockedSession.ts'
import type { HeadMountedView } from './cardboardView.ts'

export interface PlayerControlNotifier {
  subscribe(listener: (inControl: boolean) => void): void
  inControl(): boolean
  dispose(): void
}

/**
 * O ponteiro travado no canvas *é* o jogador no controle — o teste do pilar 2.
 * No óculos, o controle é o óculos posto (ADR 0012); só com o gamepad, é a
 * sessão que o menu abriu, porque gamepad não trava ponteiro.
 *
 * ```ts
 * const control = createPlayerControlNotifier(canvas, headset, unlockedSession)
 * control.subscribe((inControl) => menu.setVisible(!inControl))
 * ```
 */
export function createPlayerControlNotifier(
  canvas: HTMLCanvasElement,
  headset: HeadMountedView,
  unlockedSession: UnlockedSession,
): PlayerControlNotifier {
  const listeners = new Set<(inControl: boolean) => void>()
  const inControl = (): boolean =>
    document.pointerLockElement === canvas || headset.active || unlockedSession.active
  const notify = (): void => {
    const now = inControl()
    for (const listener of listeners) listener(now)
  }
  document.addEventListener('pointerlockchange', notify)
  headset.onActiveChange(notify)
  unlockedSession.onChange(notify)
  return {
    inControl,
    subscribe: (listener) => void listeners.add(listener),
    dispose: () => document.removeEventListener('pointerlockchange', notify),
  }
}
