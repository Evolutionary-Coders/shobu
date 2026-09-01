import { createBootLineRouter } from './domLineSink.ts'
import type { LineSink } from './terminalPrinter.ts'

/**
 * A tela de entrada: um terminal que dá boot, o logo no meio, e um clique para
 * entrar. Em dom sobre o canvas (ADR 0001), porque a identidade visual do jogo
 * é ui 2d.
 *
 * A fase é um atributo no elemento e todo o resto é css. O javascript não anima
 * nada — animação em js compete com o laço de render pelo mesmo quadro.
 */
export type BootPhase = 'idle' | 'printing' | 'revealed' | 'ready' | 'failed'

export interface BootOverlay {
  /** Roteia cada linha do boot para o canto de tela do canal dela. */
  readonly logSink: LineSink
  setPhase(phase: BootPhase): void
  announceFailure(reason: unknown): void
  reportTimeToControl(description: string): void
  setInGame(inGame: boolean): void
  /** Clique em qualquer lugar, ou qualquer tecla, enquanto a tela estiver visível. */
  onEnterRequested(listener: () => void): void
}

/** Teclas que sozinhas não significam "quero entrar". */
const IGNORED_KEYS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Tab'])

export function createBootOverlay(root: ParentNode): BootOverlay {
  const overlay = requireElement<HTMLElement>(root, '#boot-overlay')
  const status = requireElement<HTMLElement>(root, '#boot-status')
  const timer = requireElement<HTMLElement>(root, '#boot-timer')
  const crosshair = requireElement<HTMLElement>(root, '#crosshair')

  return {
    logSink: createBootLineRouter({
      telemetry: requireElement<HTMLElement>(root, '#boot-telemetry'),
      main: requireElement<HTMLElement>(root, '#boot-log'),
      uplink: requireElement<HTMLElement>(root, '#boot-uplink'),
    }),
    setPhase: (phase) => setPhase(overlay, phase),
    announceFailure: (reason) => announceFailure(overlay, status, reason),
    reportTimeToControl: (description) => {
      timer.textContent = description
    },
    setInGame: (inGame) => toggleInGame(overlay, crosshair, inGame),
    onEnterRequested: (listener) => listenForEntry(overlay, listener),
  }
}

function setPhase(overlay: HTMLElement, phase: BootPhase): void {
  if (overlay.dataset.phase === 'failed') return
  overlay.dataset.phase = phase
}

function announceFailure(overlay: HTMLElement, status: HTMLElement, reason: unknown): void {
  overlay.dataset.phase = 'failed'
  status.textContent = reason instanceof Error ? reason.message : String(reason)
}

function toggleInGame(overlay: HTMLElement, crosshair: HTMLElement, inGame: boolean): void {
  overlay.hidden = inGame
  crosshair.hidden = !inGame
}

function listenForEntry(overlay: HTMLElement, listener: () => void): void {
  overlay.addEventListener('click', listener)
  // o teclado só vale com a tela visível: sem esta guarda, cada W do jogador
  // durante a partida pediria o ponteiro de novo.
  overlay.ownerDocument.addEventListener('keydown', (event) => {
    if (overlay.hidden || event.repeat || IGNORED_KEYS.has(event.key)) return
    listener()
  })
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (element) return element
  throw new Error(`querySelector('${selector}') não achou nada; esperado um elemento no index.html`)
}
