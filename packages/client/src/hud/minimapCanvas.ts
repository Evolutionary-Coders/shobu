import { arenaMapById } from '../arena/arenaCatalog.ts'
import { writeThinBar } from './hudComponentsDom.ts'
import {
  type MinimapMatrix,
  type MinimapOp,
  type MinimapPlan,
  type MinimapView,
  minimapOpsOf,
  minimapPlanOf,
  type PingBar,
} from './minimapModel.ts'
import { MINIMAP_RADIUS_PX } from './minimapReadout.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'

/**
 * O minimapa no visor (ADR 0035): o canvas redondo debaixo do painel de
 * estado, a barra do PING e o pulso da varredura. Adapter: quem decide o que
 * vai onde é o `minimapModel.ts`; aqui só se pinta e se troca atributo, e o
 * css (`arenaMinimap.css`) anima o pulso, a barra e o aviso de interferência.
 */
export interface MinimapPanel {
  /** Todo quadro; o adapter só repinta a 30 Hz. */
  setMinimap(view: MinimapView): void
  /** A barra do PING; `null` apaga. Só quando o texto muda. */
  setPingTimer(bar: PingBar | null): void
  /** A varredura chegou: o leque ciano gira uma vez em volta do disco. */
  pulseSweep(): void
}

/** 30 Hz: o minimapa gira com a câmera, mas não precisa de cada quadro. */
const REPAINT_EVERY_MS = 1000 / 30

const CYAN = '#22d3ee'
const MAGENTA = 'rgb(240 56 200 / 34%)'
const MAGENTA_LINE = 'rgb(240 56 200 / 70%)'
const DIM = 'rgb(244 244 240 / 8%)'
const RED = '#ff2a3c'
const YELLOW = '#ffd23c'
const PLATE = 'rgb(7 8 11 / 64%)'

/**
 * ```ts
 * const minimap = createMinimapPanel(document)
 * minimap.setMinimap(view)
 * ```
 */
export function createMinimapPanel(root: ElementQuery): MinimapPanel {
  const elements = mountMinimapPanel(requireElement<HTMLElement>(root, '#arena-hud'))
  const { panel, bar, barText } = elements
  let sweepToggle = 'a'
  return {
    setMinimap: createMinimapPainter(elements),
    setPingTimer: (ping) => {
      panel.dataset.ping = ping ? 'on' : 'off'
      if (!ping) return
      writeThinBar(bar, ping.fraction)
      barText.textContent = ping.text
    },
    pulseSweep: () => {
      // a/b como no hitmarker: o mesmo valor não reiniciaria a animação.
      sweepToggle = sweepToggle === 'a' ? 'b' : 'a'
      panel.dataset.sweep = sweepToggle
    },
  }
}

/** A pintura do disco, segurada em 30 Hz, com a planta guardada por mapa. */
function createMinimapPainter(elements: MinimapElements): (view: MinimapView) => void {
  const { panel, canvas } = elements
  const ctx = canvas.getContext('2d')
  const plans = new Map<string, MinimapPlan>()
  let paintedAtMs = Number.NEGATIVE_INFINITY
  return (view) => {
    panel.dataset.jam = view.jammed ? 'on' : 'off'
    const nowMs = performance.now()
    if (!ctx || nowMs - paintedAtMs < REPAINT_EVERY_MS) return
    paintedAtMs = nowMs
    paintMinimap(ctx, view, planFor(plans, view.arenaId))
  }
}

type MakeElement = <T extends HTMLElement>(tag: string, id: string) => T

/**
 * O painel montado aqui, e não escrito no index.html, que está no teto de
 * linhas: o disco desenhado no raio do modelo (`MINIMAP_RADIUS_PX`), o leque
 * da varredura, a barra do PING com o tempo em texto, e o aviso de
 * interferência — também em texto, para ler sem cor. O css
 * (`arenaMinimap.css`) põe tudo no lugar.
 */
function mountMinimapPanel(hud: HTMLElement): MinimapElements {
  const make: MakeElement = <T extends HTMLElement>(tag: string, id: string): T => {
    const element = hud.ownerDocument.createElement(tag) as T
    element.id = id
    return element
  }
  const panel = make<HTMLElement>('div', 'hud-minimap-panel')
  panel.className = 'hud-panel'
  Object.assign(panel.dataset, { jam: 'off', ping: 'off', sweep: 'off' })
  panel.setAttribute('aria-hidden', 'true')
  const canvas = make<HTMLCanvasElement>('canvas', 'hud-minimap')
  canvas.width = MINIMAP_RADIUS_PX * 2
  canvas.height = MINIMAP_RADIUS_PX * 2
  const jam = make<HTMLElement>('span', 'hud-minimap-jam')
  jam.textContent = 'INTERFERÊNCIA'
  const { timer, bar, barText } = mountPingTimer(make)
  panel.append(canvas, make('span', 'hud-minimap-sweep'), jam, timer)
  hud.append(panel)
  return { panel, canvas, bar, barText }
}

/** A barra do PING: o tempo em texto em cima, a barra fina embaixo. */
function mountPingTimer(make: MakeElement) {
  const timer = make<HTMLElement>('div', 'hud-ping-timer')
  const bar = make<HTMLElement>('div', 'hud-ping-bar')
  bar.className = 'thin-bar'
  const barText = make<HTMLElement>('span', 'hud-ping-text')
  timer.append(barText, bar)
  return { timer, bar, barText }
}

interface MinimapElements {
  readonly panel: HTMLElement
  readonly canvas: HTMLCanvasElement
  readonly bar: HTMLElement
  readonly barText: HTMLElement
}

/** A planta, uma vez por mapa: os blocos não mudam durante a partida. */
function planFor(plans: Map<string, MinimapPlan>, arenaId: string): MinimapPlan {
  const cached = plans.get(arenaId)
  if (cached) return cached
  const plan = minimapPlanOf(arenaMapById(arenaId))
  plans.set(arenaId, plan)
  return plan
}

function paintMinimap(ctx: CanvasRenderingContext2D, view: MinimapView, plan: MinimapPlan): void {
  const size = view.radiusPx * 2
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, size, size)
  ctx.save()
  ctx.beginPath()
  ctx.arc(view.radiusPx, view.radiusPx, view.radiusPx - 1, 0, Math.PI * 2)
  ctx.clip()
  for (const op of minimapOpsOf(view)) paintOp(ctx, op, view.radiusPx, plan)
  ctx.restore()
}

function paintOp(
  ctx: CanvasRenderingContext2D,
  op: MinimapOp,
  radius: number,
  plan: MinimapPlan,
): void {
  if (op.kind === 'disc') paintDisc(ctx, radius, op.pinging)
  else if (op.kind === 'plan') paintPlan(ctx, op.matrix, plan)
  else if (op.kind === 'blip') paintBlip(ctx, op)
  else if (op.kind === 'noise') paintNoise(ctx, radius)
  else paintArrow(ctx, radius)
}

function paintDisc(ctx: CanvasRenderingContext2D, radius: number, pinging: boolean): void {
  ctx.fillStyle = PLATE
  ctx.fillRect(0, 0, radius * 2, radius * 2)
  ctx.strokeStyle = CYAN
  ctx.globalAlpha = pinging ? 1 : 0.55
  ctx.lineWidth = pinging ? 3 : 1.5
  ctx.beginPath()
  ctx.arc(radius, radius, radius - 2, 0, Math.PI * 2)
  ctx.stroke()
  // o anel do meio alcance: a distância se lê sem número.
  ctx.globalAlpha = 0.18
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(radius, radius, radius / 2, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
}

/** A planta no mundo, girada pela matriz; a linha é dividida pela escala para ficar fina. */
function paintPlan(ctx: CanvasRenderingContext2D, matrix: MinimapMatrix, plan: MinimapPlan): void {
  const [a, b] = matrix
  const pxPerM = Math.hypot(a, b)
  ctx.save()
  ctx.setTransform(...matrix)
  ctx.lineWidth = 1.2 / pxPerM
  for (const rect of plan.rects) {
    if (rect.style === 'outline') {
      ctx.strokeStyle = MAGENTA_LINE
      ctx.strokeRect(rect.xM, rect.zM, rect.widthM, rect.depthM)
      continue
    }
    ctx.fillStyle = rect.style === 'solid' ? MAGENTA : DIM
    ctx.fillRect(rect.xM, rect.zM, rect.widthM, rect.depthM)
  }
  const area = plan.playArea
  ctx.strokeStyle = RED
  ctx.setLineDash([3 / pxPerM, 3 / pxPerM])
  ctx.strokeRect(area.minX, area.minZ, area.maxX - area.minX, area.maxZ - area.minZ)
  ctx.restore()
}

function paintBlip(ctx: CanvasRenderingContext2D, op: Extract<MinimapOp, { kind: 'blip' }>): void {
  const radius = op.clamped ? 4 : 6
  ctx.save()
  ctx.globalAlpha = op.alpha
  ctx.shadowColor = RED
  ctx.shadowBlur = 10
  ctx.fillStyle = RED
  ctx.strokeStyle = RED
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(op.x, op.y, radius, 0, Math.PI * 2)
  // o tiro é um anel com miolo: lido como "atirou daqui", não "está aqui".
  if (op.tone === 'shot') {
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(op.x, op.y, 2, 0, Math.PI * 2)
  }
  ctx.fill()
  if (op.level !== 'level') paintLevelMark(ctx, op.x + radius + 5, op.y, op.level === 'above')
  ctx.restore()
}

function paintLevelMark(ctx: CanvasRenderingContext2D, x: number, y: number, above: boolean): void {
  const tip = above ? -5 : 5
  ctx.beginPath()
  ctx.moveTo(x, y + tip)
  ctx.lineTo(x - 4, y - tip)
  ctx.lineTo(x + 4, y - tip)
  ctx.closePath()
  ctx.fill()
}

/** O radar embaralhado: chiado de pontos claros, sorteado a cada pintura. */
function paintNoise(ctx: CanvasRenderingContext2D, radius: number): void {
  const size = radius * 2
  ctx.fillStyle = '#f4f4f0'
  for (let speck = 0; speck < 260; speck += 1) {
    ctx.globalAlpha = Math.random() * 0.5
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2)
  }
  ctx.globalAlpha = 1
}

/** O jogador: a seta amarela no centro, sempre para cima. */
function paintArrow(ctx: CanvasRenderingContext2D, radius: number): void {
  ctx.fillStyle = YELLOW
  ctx.shadowColor = YELLOW
  ctx.shadowBlur = 6
  ctx.beginPath()
  ctx.moveTo(radius, radius - 9)
  ctx.lineTo(radius - 6, radius + 7)
  ctx.lineTo(radius, radius + 3)
  ctx.lineTo(radius + 6, radius + 7)
  ctx.closePath()
  ctx.fill()
  ctx.shadowBlur = 0
}
