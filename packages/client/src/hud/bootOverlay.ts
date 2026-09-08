import { createBootLineRouter } from './domLineSink.ts'
import { jackInDurationMs } from './jackIn.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'
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
  /** Roteia cada linha do boot para a região de tela do canal dela. */
  readonly logSink: LineSink
  setPhase(phase: BootPhase): void
  /** Escreve o lema sob o logo. O css decide quando ele aparece. */
  setTagline(text: string): void
  /** Recebe 0 a 1 e move a barra do rodapé. */
  setProgress(ratio: number): void
  announceFailure(reason: unknown): void
  reportTimeToControl(description: string): void
  /**
   * Assume ou devolve o controle. Assumir **não** apaga a tela na hora: dispara
   * o salto, e a tela sai sozinha quando ele acaba.
   */
  setInGame(inGame: boolean): void
  /** Clique em qualquer lugar, ou qualquer tecla, enquanto a tela estiver visível. */
  onEnterRequested(listener: () => void): void
}

/** Teclas que sozinhas não significam "quero entrar". */
const IGNORED_KEYS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Tab'])

export function createBootOverlay(root: ElementQuery): BootOverlay {
  const overlay = requireElement<HTMLElement>(root, '#boot-overlay')
  const status = requireElement<HTMLElement>(root, '#boot-status')
  const timer = requireElement<HTMLElement>(root, '#boot-timer')
  const crosshair = requireElement<HTMLElement>(root, '#crosshair')
  const progressLabel = requireElement<HTMLElement>(root, '#boot-progress-label')
  const tagline = requireElement<HTMLElement>(root, '#boot-tagline')
  const jackIn = createJackInSwitch(overlay)

  return {
    logSink: createBootLineRouter({
      telemetry: requireElement<HTMLElement>(root, '#boot-telemetry'),
      brief: requireElement<HTMLElement>(root, '#boot-brief'),
      uplink: requireElement<HTMLElement>(root, '#boot-uplink'),
    }),
    setPhase: (phase) => setPhase(overlay, phase),
    setTagline: (text) => {
      tagline.textContent = text
    },
    setProgress: (ratio) => setProgress(overlay, progressLabel, ratio),
    announceFailure: (reason) => announceFailure(overlay, status, reason),
    reportTimeToControl: (description) => {
      timer.textContent = description
    },
    setInGame: (inGame) => toggleInGame(jackIn, crosshair, inGame),
    onEnterRequested: (listener) => listenForEntry(overlay, listener),
  }
}

function setPhase(overlay: HTMLElement, phase: BootPhase): void {
  if (overlay.dataset.phase === 'failed') return
  overlay.dataset.phase = phase
}

/** A largura da barra é uma custom property: o css anima, o js só informa. */
function setProgress(overlay: HTMLElement, label: HTMLElement, ratio: number): void {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100)
  overlay.style.setProperty('--boot-progress', `${percent}%`)
  label.textContent = `${String(percent).padStart(2, '0')}%`
}

function announceFailure(overlay: HTMLElement, status: HTMLElement, reason: unknown): void {
  overlay.dataset.phase = 'failed'
  status.textContent = reason instanceof Error ? reason.message : String(reason)
}

/**
 * A saída da tela de boot. O `data-jack` é um atributo **separado** do
 * `data-phase` de propósito: o salto não é uma fase do boot, é o desmonte dela,
 * e o css precisa que as regras de 'ready' continuem valendo para ter o que
 * desmontar. Trocar a fase apagaria a tela de uma vez, que é o corte seco que
 * esta transição existe para não ser.
 */
interface JackInSwitch {
  /** Começa o salto; a tela some quando a animação termina. */
  enter(): void
  /** Um esc no meio do salto: cancela a saída e devolve a tela inteira. */
  leave(): void
}

function createJackInSwitch(overlay: HTMLElement): JackInSwitch {
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  return {
    enter: () => {
      overlay.dataset.jack = 'in'
      clearTimeout(hideTimer)
      hideTimer = setTimeout(
        () => {
          overlay.hidden = true
        },
        jackInDurationMs(prefersReducedMotion(overlay)),
      )
    },
    leave: () => {
      clearTimeout(hideTimer)
      delete overlay.dataset.jack
      overlay.hidden = false
    },
  }
}

/**
 * Sem chuva não há 900ms de animação para esperar: quem pediu menos movimento
 * veria uma tela morta por meio segundo com o jogo já rodando atrás dela. A
 * consulta é aqui, a decisão é em jackIn.ts, junto das animações que ela mede.
 */
function prefersReducedMotion(overlay: HTMLElement): boolean {
  const view = overlay.ownerDocument.defaultView
  return view?.matchMedia('(prefers-reduced-motion: reduce)').matches === true
}

function toggleInGame(jackIn: JackInSwitch, crosshair: HTMLElement, inGame: boolean): void {
  crosshair.hidden = !inGame
  if (inGame) jackIn.enter()
  else jackIn.leave()
}

function listenForEntry(overlay: HTMLElement, listener: () => void): void {
  overlay.addEventListener('click', listener)
  overlay.ownerDocument.addEventListener('keydown', (event) => {
    if (!acceptsEntry(overlay) || event.repeat || IGNORED_KEYS.has(event.key)) return
    listener()
  })
}

/**
 * O teclado só vale com a tela visível e parada: sem a primeira guarda cada W
 * do jogador durante a partida pediria o ponteiro de novo, e sem a segunda o
 * primeiro passo dado durante o salto faria o mesmo — a tela ainda está no dom,
 * transparente, por cima de uma arena já jogável.
 */
function acceptsEntry(overlay: HTMLElement): boolean {
  return !overlay.hidden && overlay.dataset.jack !== 'in'
}
