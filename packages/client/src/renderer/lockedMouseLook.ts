/**
 * O olhar do mouse, que só obedece com o ponteiro travado no canvas.
 *
 * A entrada de mouse do babylon também gira a câmera por **arrasto**, sem
 * trava: o `pointerdown` guarda a posição e cada `pointermove` gira até o
 * `pointerup`. Quando o `pointerup` se perde — esc, alt-tab, a aba perdendo o
 * foco com o botão apertado —, o arrasto fica preso, e voltar para a url já
 * carregada e só mexer o mouse girava a mira (29/09). Num sniper não existe
 * olhar sem trava, então aqui ele não existe.
 *
 * E o primeiro `movementX/Y` depois de travar vem errado no chrome — é o salto
 * do cursor até o centro, contado como movimento (crbug.com/781182, pior no
 * linux) —, e a câmera pulava ao entrar. Esse evento é descartado, e qualquer
 * outro grande demais para ser mão também.
 *
 * Dado puro: quem liga ao dom é `firstPersonViewer.ts`.
 */

/**
 * O maior passo de um evento que ainda é mão, em px. Um giro de 180° em 100 ms,
 * a 125 Hz e no ganho mais rápido do jogo, dá uns 50 px por evento; o salto do
 * chrome vem na casa das centenas ou milhares.
 */
export const MAX_MOUSE_STEP_PX = 400

/** O giro de um evento, em radianos, no formato do `cameraRotation` do babylon. */
export interface LookTurn {
  x: number
  y: number
}

export interface LockedMouseLook {
  /**
   * Pixels de mouse por radiano; maior é mais lento. Quem escreve é
   * `driveLookSensitivity.ts`, a cada quadro.
   */
  angularSensibility: number
  lockChanged(locked: boolean): void
  /** Escreve o giro em `into` e diz se o evento vale. `false` não mexe em `into`. */
  turn(movementX: number, movementY: number, into: LookTurn): boolean
}

/**
 * ```ts
 * const look = createLockedMouseLook(200)
 * look.lockChanged(true)
 * look.turn(900, 0, turn) // false: o salto de entrar na trava
 * look.turn(20, -4, turn) // true: turn = { x: -0.02, y: 0.1 }
 * ```
 */
export function createLockedMouseLook(pixelsPerRadian: number): LockedMouseLook {
  const state = { locked: false, settling: false }
  const look: LockedMouseLook = {
    angularSensibility: pixelsPerRadian,
    lockChanged: (locked) => {
      state.locked = locked
      state.settling = locked
    },
    turn: (movementX, movementY, into) => {
      if (!state.locked) return false
      if (state.settling) {
        state.settling = false
        return false
      }
      if (!isHandStep(movementX, movementY)) return false
      into.x = movementY / look.angularSensibility
      into.y = movementX / look.angularSensibility
      return true
    },
  }
  return look
}

function isHandStep(movementX: number, movementY: number): boolean {
  return Math.abs(movementX) <= MAX_MOUSE_STEP_PX && Math.abs(movementY) <= MAX_MOUSE_STEP_PX
}
