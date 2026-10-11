import type { GameplayConfig } from '@shobu/core'
import {
  createGlyphLabel,
  type GlyphLabel,
  writeThinBar,
  writeThinBarDivisions,
} from './hudComponentsDom.ts'
import type { GlyphSheet } from './hudGlyphText.ts'
import { clockBoxes, clockTone, type SessionMode } from './matchClock.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'
import { thinBarDivisions, thinBarFraction } from './thinBar.ts'
import { callsignLabel, pointsLabel } from './visorFields.ts'

/**
 * O painel de estado, no canto superior esquerdo: o `RAIDEN [100][00]%` do
 * Metal Gear Rising, trocado pelo que o shōbu tem. O shōbu não tem vida — um
 * tiro mata —, então o que mora aqui é o nome, o relógio em caixas, a barra
 * vermelha do tempo que resta e os pontos.
 */
export interface StatusPanel {
  /** Segundos restantes. Só escreve no dom quando o segundo inteiro muda. */
  setTimeLeft(secondsLeft: number): void
  /** Partida ou treino. No treino o relógio não conta. */
  setMode(mode: SessionMode): void
  setPoints(points: number): void
}

export interface StatusPanelOptions {
  readonly root: ElementQuery
  readonly sheet: GlyphSheet
  readonly config: GameplayConfig
  /** O apelido do jogador. O jogo ainda não tem um, e o painel mostra AGENTE. */
  readonly callsign?: string | undefined
}

const CALLSIGN_HEIGHT_PX = 22
const CLOCK_HEIGHT_PX = 18
const POINTS_HEIGHT_PX = 13

/** Uma marca na barra por minuto de partida. */
const CLOCK_BAR_STEP_S = 60

interface StatusView {
  readonly hud: HTMLElement
  readonly bar: HTMLElement
  readonly clocks: readonly GlyphLabel[]
  readonly points: GlyphLabel
}

/**
 * ```ts
 * const status = createStatusPanel({ root: document, sheet, config })
 * status.setTimeLeft(300)
 * ```
 */
export function createStatusPanel(options: StatusPanelOptions): StatusPanel {
  const { config } = options
  const view = statusView(options)
  writeThinBarDivisions(view.bar, thinBarDivisions(config.match.durationS, CLOCK_BAR_STEP_S))
  const state = { mode: 'match' as SessionMode, lastWholeSecond: Number.NaN }
  return {
    setTimeLeft: (secondsLeft) => {
      const whole = Math.ceil(Math.max(0, secondsLeft))
      if (whole === state.lastWholeSecond) return
      state.lastWholeSecond = whole
      writeClock(view, config, { mode: state.mode, secondsLeft })
    },
    setMode: (mode) => {
      state.mode = mode
      view.hud.dataset.mode = mode
      // o segundo guardado é invalidado: sem isto, trocar de modo no mesmo
      // segundo deixaria o relógio no texto do modo anterior.
      state.lastWholeSecond = Number.NaN
    },
    setPoints: (value) => view.points.write(pointsLabel(value)),
  }
}

/** Monta os mostradores do painel. O nome é escrito aqui, uma vez: ele não muda na partida. */
function statusView(options: StatusPanelOptions): StatusView {
  const { root, sheet } = options
  const label = (selector: string, heightPx: number): GlyphLabel =>
    createGlyphLabel(requireElement(root, selector), { sheet, heightPx })
  label('#hud-callsign', CALLSIGN_HEIGHT_PX).write(callsignLabel(options.callsign))
  return {
    hud: requireElement<HTMLElement>(root, '#arena-hud'),
    bar: requireElement<HTMLElement>(root, '#hud-clock-bar'),
    clocks: [label('#hud-clock-min', CLOCK_HEIGHT_PX), label('#hud-clock-sec', CLOCK_HEIGHT_PX)],
    points: label('#hud-points', POINTS_HEIGHT_PX),
  }
}

interface ClockFrame {
  readonly mode: SessionMode
  readonly secondsLeft: number
}

/**
 * No treino a barra fica cheia e parada: ela é o mesmo relógio desenhado de
 * outro jeito, e uma barra andando sob a palavra TREINO seria a tela contando
 * o que ela acabou de dizer que não conta. A segunda caixa some pelo css, com
 * `data-mode`.
 */
function writeClock(view: StatusView, config: GameplayConfig, frame: ClockFrame): void {
  clockBoxes(frame.mode, frame.secondsLeft).forEach((text, index) => {
    view.clocks[index]?.write(text)
  })
  if (frame.mode === 'training') {
    view.hud.dataset.clock = 'calm'
    writeThinBar(view.bar, 1)
    return
  }
  view.hud.dataset.clock = clockTone(frame.secondsLeft)
  writeThinBar(view.bar, thinBarFraction(frame.secondsLeft, config.match.durationS))
}
