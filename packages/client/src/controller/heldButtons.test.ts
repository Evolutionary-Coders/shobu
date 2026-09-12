import { describe, expect, it } from 'vitest'
import {
  actionForMouseButton,
  createHeldButtons,
  type MouseButtonEvent,
  type MouseEventSource,
  releaseAllButtons,
  trackHeldButtons,
} from './heldButtons.ts'

/** Evento de mouse de mentira, no molde do `FakeKeyEvent` do teclado. */
class FakeMouseEvent implements MouseButtonEvent {
  defaultPrevented = false
  constructor(readonly button: number) {}
  preventDefault(): void {
    this.defaultPrevented = true
  }
}

/** Fonte de eventos de mentira: o teste aperta e solta os botões à mão. */
class FakeMouseSource implements MouseEventSource {
  private readonly listeners = new Map<string, Set<(event: MouseButtonEvent) => void>>()

  addEventListener(type: string, listener: (event: MouseButtonEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: (event: MouseButtonEvent) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  emit(type: string, event: MouseButtonEvent): MouseButtonEvent {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
    return event
  }

  press(button: number): FakeMouseEvent {
    return this.emit('mousedown', new FakeMouseEvent(button)) as FakeMouseEvent
  }

  release(button: number): FakeMouseEvent {
    return this.emit('mouseup', new FakeMouseEvent(button)) as FakeMouseEvent
  }

  get listenerCount(): number {
    return [...this.listeners.values()].reduce((total, set) => total + set.size, 0)
  }
}

const LEFT = 0
const MIDDLE = 1
const RIGHT = 2

describe('actionForMouseButton', () => {
  it('o botão esquerdo atira e o direito mira', () => {
    expect(actionForMouseButton(LEFT)).toBe('fire')
    expect(actionForMouseButton(RIGHT)).toBe('scope')
  })

  it('a roda não é ação do jogo', () => {
    expect(actionForMouseButton(MIDDLE)).toBeUndefined()
  })
})

describe('trackHeldButtons', () => {
  it('reflete o botão enquanto ele está preso', () => {
    const source = new FakeMouseSource()
    const tracker = trackHeldButtons(source)
    source.press(LEFT)
    expect(tracker.buttons.fire).toBe(true)
    source.release(LEFT)
    expect(tracker.buttons.fire).toBe(false)
  })

  it('os dois botões são independentes', () => {
    const source = new FakeMouseSource()
    const tracker = trackHeldButtons(source)
    source.press(RIGHT)
    source.press(LEFT)
    source.release(LEFT)
    expect(tracker.buttons.scope).toBe(true)
    expect(tracker.buttons.fire).toBe(false)
  })

  it('impede o comportamento padrão só dos botões do jogo', () => {
    const source = new FakeMouseSource()
    trackHeldButtons(source)
    expect(source.press(LEFT).defaultPrevented).toBe(true)
    expect(source.press(MIDDLE).defaultPrevented).toBe(false)
  })

  /** Menu do navegador aberto sobre um ponteiro travado é jogo morto. */
  it('bloqueia o menu de contexto sempre', () => {
    const source = new FakeMouseSource()
    trackHeldButtons(source)
    const event = source.emit('contextmenu', new FakeMouseEvent(RIGHT)) as FakeMouseEvent
    expect(event.defaultPrevented).toBe(true)
  })

  it('descartar o rastreador remove os ouvintes', () => {
    const source = new FakeMouseSource()
    trackHeldButtons(source).dispose()
    expect(source.listenerCount).toBe(0)
  })
})

describe('releaseAllButtons', () => {
  /** Perder o ponteiro travado com o botão direito preso deixaria o jogador mirando. */
  it('solta tudo', () => {
    const buttons = createHeldButtons()
    buttons.fire = true
    buttons.scope = true
    releaseAllButtons(buttons)
    expect(buttons).toEqual({ fire: false, scope: false })
  })
})
