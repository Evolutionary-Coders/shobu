import { scorestreakSlotOf } from '../controller/scorestreakTrigger.ts'
import {
  pressTouchButton,
  releaseTouchTargets,
  type TouchButton,
  type TouchTargets,
} from '../controller/touchButtons.ts'
import type { TouchRouter } from '../controller/touchRouter.ts'
import { stickLayoutFromRects, type TouchStickLayout } from '../controller/touchStickLayout.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'

/**
 * Os controles de toque em dom (ADR 0001). Adapter: ouve os dedos, entrega
 * cada um ao `touchRouter.ts` ou ao `touchButtons.ts`, e troca atributo e
 * posição para o css desenhar. Nenhuma decisão de jogo mora aqui.
 *
 * Captura o ponteiro em todo `pointerdown`: o dedo que escorrega para fora do
 * botão ou da zona do analógico continua sendo dele até sair do vidro — sem isto,
 * o `pointerup` caía em outro elemento e o tiro ficava preso.
 */
export interface TouchControls {
  /** Mostra ao entrar pelo toque; esconder solta tudo o que os dedos seguravam. */
  setVisible(visible: boolean): void
  onPause(listener: () => void): void
  /**
   * Com a lâmina na mão, o botão dela diz SNIPER: é ele que volta à arma
   * principal no toque (`touchButtons.ts`). Só escreve na mudança.
   */
  setBladeDrawn(drawn: boolean): void
  /**
   * Acende o botão de agachar com o pedido ligado. O pedido mora no núcleo
   * (`crouch.ts`), e não no botão: o shift, o pulo e a morte também o apagam.
   */
  setCrouched(on: boolean): void
  /** Acende o botão de cada série pronta (ADR 0029). Só escreve na mudança. */
  setScorestreaksReady(ready: readonly boolean[]): void
}

/** O rótulo do botão da lâmina nos dois estados: o que ele faz **agora**. */
const BLADE_BUTTON_FACES = {
  sheathed: { kanji: '刀', label: 'LÂMINA', aria: 'lâmina: toque golpeia, segure para empunhar' },
  drawn: { kanji: '銃', label: 'SNIPER', aria: 'sniper: volta à arma principal' },
} as const

/**
 * ```ts
 * const touch = createTouchControls(document, createTouchRouter(), { keys, buttons, stick })
 * touch.onPause(() => session.exit())
 * ```
 */
export function createTouchControls(
  root: ElementQuery,
  router: TouchRouter,
  targets: TouchTargets,
): TouchControls {
  const layer = requireElement<HTMLElement>(root, '#touch-controls')
  const stick = requireElement<HTMLElement>(root, '.touch-stick')
  const zone = requireElement<HTMLElement>(root, '.touch-stick-zone')
  const pauses: Array<() => void> = []
  const buttons = [...layer.querySelectorAll<HTMLElement>('[data-touch]')]
  const pause = (): void => {
    for (const listener of pauses) listener()
  }
  for (const button of buttons) bindButton(button, targets, pause)
  bindSurface(layer, router, { ring: stick, zone })
  const parts = { layer, stick, buttons, router, targets }
  return {
    setVisible: (visible) => showLayer(parts, visible),
    onPause: (listener) => void pauses.push(listener),
    setBladeDrawn: (drawn) => showBladeState(buttons.find(isBladeButton), drawn),
    setCrouched: (on) => showCrouched(buttons.find(isCrouchButton), on),
    setScorestreaksReady: (ready) => showScorestreaksReady(buttons, ready),
  }
}

interface TouchParts {
  readonly layer: HTMLElement
  readonly stick: HTMLElement
  readonly buttons: readonly HTMLElement[]
  readonly router: TouchRouter
  readonly targets: TouchTargets
}

function showLayer(parts: TouchParts, visible: boolean): void {
  parts.layer.hidden = !visible
  // na raiz, e não `body:has(...)`: o css do hud inteiro se arruma em volta
  // dos polegares com um seletor só, `:root[data-touch-ui="on"]`.
  parts.layer.ownerDocument.documentElement.dataset.touchUi = visible ? 'on' : 'off'
  if (visible) return
  parts.router.reset()
  releaseTouchTargets(parts.targets)
  restStick(parts.stick)
  for (const button of parts.buttons) clearPressed(button)
}

function isBladeButton(button: HTMLElement): boolean {
  return button.dataset.touch === 'melee'
}

function isCrouchButton(button: HTMLElement): boolean {
  return button.dataset.touch === 'crouch'
}

function showCrouched(crouch: HTMLElement | undefined, on: boolean): void {
  if (!crouch || crouch.dataset.on === String(on)) return
  crouch.dataset.on = String(on)
}

/** O botão de cada série diz o slot pelo `data-touch`, como o aperto (`scorestreakSlotOf`). */
function showScorestreaksReady(buttons: readonly HTMLElement[], ready: readonly boolean[]): void {
  for (const button of buttons) {
    const slot = scorestreakSlotOf(button.dataset.touch ?? '')
    const on = String(ready[slot] === true)
    if (slot >= 0 && button.dataset.ready !== on) button.dataset.ready = on
  }
}

function showBladeState(blade: HTMLElement | undefined, drawn: boolean): void {
  if (!blade || blade.dataset.blade === String(drawn)) return
  blade.dataset.blade = String(drawn)
  writeBladeFace(blade, BLADE_BUTTON_FACES[drawn ? 'drawn' : 'sheathed'])
}

function writeBladeFace(
  button: HTMLElement,
  face: (typeof BLADE_BUTTON_FACES)[keyof typeof BLADE_BUTTON_FACES],
): void {
  button.setAttribute('aria-label', face.aria)
  const kanji = button.querySelector('.touch-kanji')
  const label = button.querySelector('.touch-label')
  if (kanji) kanji.textContent = face.kanji
  if (label) label.textContent = face.label
}

function bindButton(button: HTMLElement, targets: TouchTargets, pause: () => void): void {
  const action = button.dataset.touch
  const press = (pressed: boolean): void => {
    button.dataset.pressed = String(pressed)
    if (action === 'pause') {
      if (pressed) pause()
      return
    }
    pressTouchButton(action as TouchButton, pressed, targets)
  }
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    capturePointer(button, event.pointerId)
    press(true)
  })
  // `lostpointercapture` também solta: o dedo que o navegador perdeu sem
  // `pointerup` (gesto do sistema, aba trocada) deixava o botão preso.
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    button.addEventListener(type, () => press(false))
  }
}

function clearPressed(button: HTMLElement): void {
  button.dataset.pressed = 'false'
  button.dataset.on = 'false'
}

interface StickElements {
  /** O anel desenhado: o centro dele é a base, e a largura dá o curso. */
  readonly ring: HTMLElement
  /** A caixa invisível que liga o analógico (`touchControls.css`). */
  readonly zone: HTMLElement
}

/**
 * Mede o anel e a zona no próprio toque, e não uma vez: o css os ancora com
 * `vh`, `min()` e as bordas seguras, que mudam ao girar o celular, ao abrir a
 * barra do navegador e ao entrar em tela cheia — e dois `getBoundingClientRect`
 * por dedo que encosta custam nada.
 */
function measureStick(parts: StickElements): TouchStickLayout {
  return stickLayoutFromRects(
    parts.ring.getBoundingClientRect(),
    parts.zone.getBoundingClientRect(),
  )
}

/** O dedo do analógico: o pino segue só ele, e não o polegar que mira. */
interface StickThumb {
  pointerId: number
  radius: number
}

/** A superfície livre: o que não é botão é polegar andando ou mirando. */
function bindSurface(layer: HTMLElement, router: TouchRouter, parts: StickElements): void {
  const thumb: StickThumb = { pointerId: -1, radius: 0 }
  const stick = parts.ring
  layer.addEventListener('pointerdown', (event) => {
    if (event.target !== layer) return
    event.preventDefault()
    capturePointer(layer, event.pointerId)
    claimSurfaceFinger(router, parts, thumb, event)
  })
  layer.addEventListener('pointermove', (event) => {
    router.move(event.pointerId, pointOf(event))
    if (event.pointerId === thumb.pointerId) drawKnob(stick, router, event, thumb.radius)
  })
  for (const type of ['pointerup', 'pointercancel'] as const) {
    layer.addEventListener(type, (event) => {
      router.up(event.pointerId)
      if (event.pointerId !== thumb.pointerId) return
      thumb.pointerId = -1
      restStick(stick)
    })
  }
}

/** Entrega o dedo ao roteador e, se ele anda, acende o anel e já desenha o pino. */
function claimSurfaceFinger(
  router: TouchRouter,
  parts: StickElements,
  thumb: StickThumb,
  event: PointerEvent,
): void {
  const layout = measureStick(parts)
  if (router.down(event.pointerId, pointOf(event), layout) !== 'move') return
  thumb.pointerId = event.pointerId
  thumb.radius = layout.radius
  parts.ring.dataset.active = 'true'
  drawKnob(parts.ring, router, event, layout.radius)
}

function pointOf(event: PointerEvent): { x: number; y: number } {
  return { x: event.clientX, y: event.clientY }
}

/** O anel apagado e o pino no centro: o analógico sem polegar, sempre à vista. */
function restStick(stick: HTMLElement): void {
  stick.dataset.active = 'false'
  stick.style.setProperty('--knob-x', '0px')
  stick.style.setProperty('--knob-y', '0px')
}

/** O pino segue o polegar, preso no anel: além do raio, ele para na borda. */
function drawKnob(
  stick: HTMLElement,
  router: TouchRouter,
  event: PointerEvent,
  radius: number,
): void {
  const origin = router.stickOrigin()
  if (!origin) return
  const dx = event.clientX - origin.x
  const dy = event.clientY - origin.y
  const scale = Math.min(1, radius / Math.max(1, Math.hypot(dx, dy)))
  stick.style.setProperty('--knob-x', `${dx * scale}px`)
  stick.style.setProperty('--knob-y', `${dy * scale}px`)
}

/**
 * A captura é conforto, não requisito: um ponteiro que o navegador já soltou
 * (o dedo saiu no mesmo quadro) faz `setPointerCapture` lançar, e o aperto
 * tem que valer mesmo assim.
 */
function capturePointer(element: HTMLElement, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId)
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    console.warn(JSON.stringify({ event: 'touch-capture-refused', pointerId, message }))
  }
}
