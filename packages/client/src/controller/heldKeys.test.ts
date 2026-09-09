import { describe, expect, it } from 'vitest'
import {
  actionForKeyCode,
  createHeldKeys,
  type KeyEventSource,
  releaseAll,
  trackHeldKeys,
} from './heldKeys.ts'

type Listener = (event: KeyboardEvent) => void

/** Um alvo de eventos de mentira: guarda os ouvintes e deixa o teste disparar. */
class FakeKeySource implements KeyEventSource {
  readonly listeners = new Map<string, Set<Listener | (() => void)>>()
  addEventListener(type: string, listener: Listener | (() => void)): void {
    const set = this.listeners.get(type) ?? new Set()
    set.add(listener)
    this.listeners.set(type, set)
  }
  removeEventListener(type: string, listener: Listener | (() => void)): void {
    this.listeners.get(type)?.delete(listener)
  }
  press(code: string): FakeKeyEvent {
    return this.fire('keydown', code)
  }
  release(code: string): FakeKeyEvent {
    return this.fire('keyup', code)
  }
  blur(): void {
    for (const listener of this.listeners.get('blur') ?? []) (listener as () => void)()
  }
  private fire(type: 'keydown' | 'keyup', code: string): FakeKeyEvent {
    const event = new FakeKeyEvent(code)
    for (const listener of this.listeners.get(type) ?? []) {
      ;(listener as Listener)(event as unknown as KeyboardEvent)
    }
    return event
  }
}

class FakeKeyEvent {
  defaultPrevented = false
  constructor(readonly code: string) {}
  preventDefault(): void {
    this.defaultPrevented = true
  }
}

describe('actionForKeyCode', () => {
  it.each([
    ['KeyW', 'forward'],
    ['KeyA', 'left'],
    ['KeyS', 'back'],
    ['KeyD', 'right'],
    ['ShiftLeft', 'sprint'],
    ['Space', 'jump'],
    ['KeyC', 'crouch'],
  ])('%s é %s', (code, action) => {
    expect(actionForKeyCode(code)).toBe(action)
  })

  /** Ctrl+W fecha a aba; slide no ctrl seria aposta contra o navegador. */
  it('não usa ctrl para nada', () => {
    expect(actionForKeyCode('ControlLeft')).toBeUndefined()
    expect(actionForKeyCode('ControlRight')).toBeUndefined()
  })
})

describe('trackHeldKeys', () => {
  it('reflete a tecla enquanto ela está presa', () => {
    const source = new FakeKeySource()
    const { keys } = trackHeldKeys(source)
    source.press('KeyW')
    expect(keys.forward).toBe(true)
    source.release('KeyW')
    expect(keys.forward).toBe(false)
  })

  it('ignora tecla que não é do jogo e não a impede', () => {
    const source = new FakeKeySource()
    const { keys } = trackHeldKeys(source)
    const event = source.press('KeyQ')
    expect(keys).toEqual(createHeldKeys())
    expect(event.defaultPrevented).toBe(false)
  })

  /** Espaço rola a página; com o jogador no controle isso não pode acontecer. */
  it('impede o padrão do navegador nas teclas do jogo', () => {
    const source = new FakeKeySource()
    trackHeldKeys(source)
    expect(source.press('Space').defaultPrevented).toBe(true)
  })

  it('solta tudo ao perder o foco', () => {
    const source = new FakeKeySource()
    const { keys } = trackHeldKeys(source)
    source.press('KeyW')
    source.press('ShiftLeft')
    source.blur()
    expect(keys).toEqual(createHeldKeys())
  })

  it('dispose para de escutar', () => {
    const source = new FakeKeySource()
    const tracker = trackHeldKeys(source)
    tracker.dispose()
    source.press('KeyW')
    expect(tracker.keys.forward).toBe(false)
  })
})

describe('releaseAll', () => {
  it('zera todas as ações', () => {
    const keys = createHeldKeys()
    keys.jump = true
    keys.crouch = true
    releaseAll(keys)
    expect(keys).toEqual(createHeldKeys())
  })
})
