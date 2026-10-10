/**
 * O START tem dois gestos: o toque curto e o segurar. No óculos, o toque
 * recentra e segurar tira do óculos — sem o segurar, quem entrou no VR pelo
 * controle não tinha saída: o aperto de gamepad não abre tela cheia nem trava
 * o ponteiro, então nenhum evento de saída chegava (revisão do PR #17).
 */
export type StartGesture = 'tap' | 'hold'

/** Quanto o START precisa ficar preso para ser "segurar". Longo o bastante para não sair por engano. */
export const START_HOLD_MS = 800

export interface StartGestureReader {
  /** O estado do START neste quadro; devolve o gesto que acabou de se completar. */
  read(held: boolean, nowMs: number): StartGesture | undefined
}

/**
 * O segurar dispara **ao completar o tempo**, com o dedo ainda no botão: quem
 * segura para sair não deveria ter que adivinhar quando soltar. O toque só
 * dispara ao soltar, porque antes disso ainda pode virar segurar.
 *
 * ```ts
 * const start = createStartGestureReader()
 * start.read(true, 0) // undefined
 * start.read(false, 120) // 'tap'
 * ```
 */
export function createStartGestureReader(): StartGestureReader {
  const press = { sinceMs: undefined as number | undefined, fired: false }
  return {
    read: (held, nowMs) => (held ? readHeld(press, nowMs) : readReleased(press)),
  }
}

interface StartPress {
  sinceMs: number | undefined
  fired: boolean
}

function readHeld(press: StartPress, nowMs: number): StartGesture | undefined {
  press.sinceMs ??= nowMs
  if (press.fired || nowMs - press.sinceMs < START_HOLD_MS) return undefined
  press.fired = true
  return 'hold'
}

function readReleased(press: StartPress): StartGesture | undefined {
  const tapped = press.sinceMs !== undefined && !press.fired
  press.sinceMs = undefined
  press.fired = false
  return tapped ? 'tap' : undefined
}

/** O que o gesto pede ao jogo. */
export type StartAction = 'recenter' | 'leave-headset' | 'pause'

/**
 * No óculos, toque recentra e segurar sai. Fora dele os dois pausam: quem
 * joga só de controle no desktop volta ao menu, segure ou não.
 *
 * ```ts
 * startActionFor('hold', true) // 'leave-headset'
 * ```
 */
export function startActionFor(gesture: StartGesture, inHeadset: boolean): StartAction {
  if (!inHeadset) return 'pause'
  return gesture === 'tap' ? 'recenter' : 'leave-headset'
}
