import { describe, expect, it } from 'vitest'
import type { KeyEventSource } from './heldKeys.ts'
import { bindPushToTalk, TALK_KEY_CODE } from './pushToTalk.ts'

type Listener = (event: KeyboardEvent) => void

/** Um alvo de eventos de teclado de mentira: guarda os ouvintes e deixa o teste disparar. */
class FakeWindow implements KeyEventSource {
  readonly listeners = new Map<string, Set<Listener | (() => void)>>()
  addEventListener(type: string, listener: Listener | (() => void)): void {
    const set = this.listeners.get(type) ?? new Set()
    set.add(listener)
    this.listeners.set(type, set)
  }
  removeEventListener(type: string, listener: Listener | (() => void)): void {
    this.listeners.get(type)?.delete(listener)
  }
  fire(type: 'keydown' | 'keyup', code: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      ;(listener as Listener)({ code } as KeyboardEvent)
    }
  }
  blur(): void {
    for (const listener of this.listeners.get('blur') ?? []) (listener as () => void)()
  }
}

function bind(source: FakeWindow): { calls: boolean[]; dispose: () => void } {
  const calls: boolean[] = []
  const dispose = bindPushToTalk(source, (on) => calls.push(on))
  return { calls, dispose }
}

describe('bindPushToTalk', () => {
  it('fala enquanto o V está preso', () => {
    const source = new FakeWindow()
    const { calls } = bind(source)
    source.fire('keydown', TALK_KEY_CODE)
    source.fire('keyup', TALK_KEY_CODE)
    expect(calls).toEqual([true, false])
  })

  it('ignora a repetição automática e as outras teclas', () => {
    const source = new FakeWindow()
    const { calls } = bind(source)
    source.fire('keydown', TALK_KEY_CODE)
    source.fire('keydown', TALK_KEY_CODE)
    source.fire('keydown', 'KeyW')
    source.fire('keyup', 'KeyW')
    expect(calls).toEqual([true])
  })

  it('fecha o microfone ao perder o foco com o V preso', () => {
    const source = new FakeWindow()
    const { calls } = bind(source)
    source.fire('keydown', TALK_KEY_CODE)
    source.blur()
    source.blur()
    expect(calls).toEqual([true, false])
  })

  it('para de escutar depois do dispose', () => {
    const source = new FakeWindow()
    const { calls, dispose } = bind(source)
    dispose()
    source.fire('keydown', TALK_KEY_CODE)
    expect(calls).toEqual([])
    expect([...source.listeners.values()].every((set) => set.size === 0)).toBe(true)
  })
})
