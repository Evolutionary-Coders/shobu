import {
  pressTouchButton,
  releaseTouchTargets,
  type TouchButton,
  type TouchTargets,
} from '../controller/touchButtons.ts'
import { TOUCH_STICK_RADIUS_PX, type TouchRouter } from '../controller/touchRouter.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'

/**
 * Os controles de toque em dom (ADR 0001). Adapter: ouve os dedos, entrega
 * cada um ao `touchRouter.ts` ou ao `touchButtons.ts`, e troca atributo e
 * posição para o css desenhar. Nenhuma decisão de jogo mora aqui.
 *
 * Captura o ponteiro em todo `pointerdown`: o dedo que escorrega para fora do
 * botão ou da metade da tela continua sendo dele até sair do vidro — sem isto,
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
  const pauses: Array<() => void> = []
  const buttons = [...layer.querySelectorAll<HTMLElement>('[data-touch]')]
  const pause = (): void => {
    for (const listener of pauses) listener()
  }
  for (const button of buttons) bindButton(button, targets, pause)
  bindSurface(layer, router, stick)
  return {
    setVisible: (visible) => {
      layer.hidden = !visible
      if (visible) return
      router.reset()
      releaseTouchTargets(targets)
      stick.dataset.active = 'false'
      for (const button of buttons) clearPressed(button)
    },
    onPause: (listener) => void pauses.push(listener),
    setBladeDrawn: (drawn) => showBladeState(buttons.find(isBladeButton), drawn),
  }
}

function isBladeButton(button: HTMLElement): boolean {
  return button.dataset.touch === 'melee'
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
    if (action === 'crouch') button.dataset.on = String(targets.keys.crouch)
  }
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    capturePointer(button, event.pointerId)
    press(true)
  })
  for (const type of ['pointerup', 'pointercancel'] as const) {
    button.addEventListener(type, () => press(false))
  }
}

function clearPressed(button: HTMLElement): void {
  button.dataset.pressed = 'false'
  button.dataset.on = 'false'
}

/** A superfície livre: o que não é botão é polegar andando ou mirando. */
function bindSurface(layer: HTMLElement, router: TouchRouter, stick: HTMLElement): void {
  // o dedo do analógico: o pino segue só ele, e não o polegar que mira.
  const thumb = { pointerId: -1 }
  layer.addEventListener('pointerdown', (event) => {
    if (event.target !== layer) return
    event.preventDefault()
    capturePointer(layer, event.pointerId)
    if (router.down(event.pointerId, pointOf(event), layer.clientWidth) !== 'move') return
    thumb.pointerId = event.pointerId
    showStick(stick, router)
  })
  layer.addEventListener('pointermove', (event) => {
    router.move(event.pointerId, pointOf(event))
    if (event.pointerId === thumb.pointerId) drawKnob(stick, router, event)
  })
  for (const type of ['pointerup', 'pointercancel'] as const) {
    layer.addEventListener(type, (event) => {
      router.up(event.pointerId)
      if (event.pointerId !== thumb.pointerId) return
      thumb.pointerId = -1
      stick.dataset.active = 'false'
    })
  }
}

function pointOf(event: PointerEvent): { x: number; y: number } {
  return { x: event.clientX, y: event.clientY }
}

function showStick(stick: HTMLElement, router: TouchRouter): void {
  const origin = router.stickOrigin()
  if (!origin) return
  stick.style.setProperty('--stick-x', `${origin.x}px`)
  stick.style.setProperty('--stick-y', `${origin.y}px`)
  stick.style.setProperty('--knob-x', '0px')
  stick.style.setProperty('--knob-y', '0px')
  stick.dataset.active = 'true'
}

/** O pino segue o polegar, preso no anel: além do raio, ele para na borda. */
function drawKnob(stick: HTMLElement, router: TouchRouter, event: PointerEvent): void {
  const origin = router.stickOrigin()
  if (!origin) return
  const dx = event.clientX - origin.x
  const dy = event.clientY - origin.y
  const scale = Math.min(1, TOUCH_STICK_RADIUS_PX / Math.max(1, Math.hypot(dx, dy)))
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
