import type { ArenaRenderer } from '../renderer/arenaRenderer.ts'
import { createLoadDeadline } from './loadDeadline.ts'
import type { BootBar } from './loadProgress.ts'

/** A carga dos downloads pesados: a promessa de pronto e a consulta imediata. */
export interface GameLoad {
  readonly ready: Promise<void>
  isReady(): boolean
}

/**
 * Liga o progresso dos downloads do renderer à barra do boot, e devolve quando
 * o jogo inteiro chegou — ou quando a espera venceu (`loadDeadline.ts`): aí o
 * jogador entra no greybox e a arte chega depois, se chegar.
 *
 * ```ts
 * const load = watchGameLoad(renderer, createBootBar(overlay.setProgress))
 * await load.ready
 * ```
 */
export function watchGameLoad(renderer: ArenaRenderer, bar: BootBar): GameLoad {
  let ready = false
  let resolve = (): void => {}
  const promise = new Promise<void>((settle) => {
    resolve = settle
  })
  const open = (): void => {
    if (ready) return
    ready = true
    resolve()
  }
  let ratio = 0
  renderer.onLoadProgress((loaded, complete) => {
    ratio = loaded
    bar.loaded(loaded)
    if (complete) open()
  })
  watchLoadDeadline(
    () => ratio,
    () => ready,
    open,
  )
  return { ready: promise, isReady: () => ready }
}

function watchLoadDeadline(ratio: () => number, isReady: () => boolean, open: () => void): void {
  const deadline = createLoadDeadline(performance.now() / 1000)
  const timer = setInterval(() => {
    if (isReady()) {
      clearInterval(timer)
      return
    }
    if (!deadline.expired(ratio(), performance.now() / 1000)) return
    console.warn(JSON.stringify({ event: 'arena-load-released', ratio: ratio() }))
    clearInterval(timer)
    open()
  }, 500)
}
