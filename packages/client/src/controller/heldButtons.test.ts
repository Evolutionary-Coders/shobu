import { describe, expect, it } from 'vitest'
import {
  createHeldButtons,
  holdButton,
  type MouseButtonEvent,
  type MouseEventSource,
  releaseAllButtons,
  takePress,
  trackHeldButtons,
} from './heldButtons.ts'

/** Evento de ponteiro de mentira, no molde do `FakeKeyEvent` do teclado. */
class FakeMouseEvent implements MouseButtonEvent {
  defaultPrevented = false
  constructor(
    readonly buttons: number,
    readonly pointerType = 'mouse',
  ) {}
  preventDefault(): void {
    this.defaultPrevented = true
  }
}

/** O bit de cada botão na máscara `buttons`: o direito é 2 e a roda é 4. */
const BIT_BY_BUTTON: Readonly<Record<number, number>> = { 0: 1, 1: 4, 2: 2 }

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

  private held = 0

  /**
   * Como o navegador: o primeiro botão desce com `pointerdown`, e o segundo,
   * com o primeiro preso, chega só como `pointermove` com a máscara nova.
   */
  press(button: number): FakeMouseEvent {
    const type = this.held === 0 ? 'pointerdown' : 'pointermove'
    this.held |= BIT_BY_BUTTON[button] ?? 0
    return this.emit(type, new FakeMouseEvent(this.held)) as FakeMouseEvent
  }

  release(button: number): FakeMouseEvent {
    this.held &= ~(BIT_BY_BUTTON[button] ?? 0)
    const type = this.held === 0 ? 'pointerup' : 'pointermove'
    return this.emit(type, new FakeMouseEvent(this.held)) as FakeMouseEvent
  }

  get listenerCount(): number {
    return [...this.listeners.values()].reduce((total, set) => total + set.size, 0)
  }
}

const LEFT = 0
const MIDDLE = 1
const RIGHT = 2

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

  /**
   * Validação da `dev` (10/10): com `mousedown`, o clique nunca chegava. O
   * segundo botão com o primeiro preso só existe como `pointermove`.
   */
  it('o acorde: o direito apertado com o esquerdo preso também mira', () => {
    const source = new FakeMouseSource()
    const tracker = trackHeldButtons(source)
    source.press(LEFT)
    source.press(RIGHT)
    expect([tracker.buttons.fire, tracker.buttons.scope]).toEqual([true, true])
  })

  it('mover sem mudar botão não mexe em nada nem cancela o evento', () => {
    const source = new FakeMouseSource()
    const tracker = trackHeldButtons(source)
    source.press(LEFT)
    takePress(tracker.buttons, 'fire')
    const move = source.emit('pointermove', new FakeMouseEvent(1)) as FakeMouseEvent
    expect([move.defaultPrevented, takePress(tracker.buttons, 'fire')]).toEqual([false, false])
  })

  it('o toque não atira pelo canvas: quem atira com o dedo é a camada de toque', () => {
    const source = new FakeMouseSource()
    const tracker = trackHeldButtons(source)
    source.emit('pointerdown', new FakeMouseEvent(1, 'touch'))
    expect(tracker.buttons.fire).toBe(false)
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
    expect(buttons.fire).toBe(false)
    expect(buttons.scope).toBe(false)
  })

  /** Sair da partida não pode deixar um tiro pendurado esperando a volta. */
  it('joga fora o aperto que nenhum tick leu', () => {
    const source = new FakeMouseSource()
    const tracker = trackHeldButtons(source)
    source.press(LEFT)
    releaseAllButtons(tracker.buttons)
    expect(takePress(tracker.buttons, 'fire')).toBe(false)
  })
})

/**
 * O núcleo lê "o que está preso agora?" uma vez por tick. Um clique que desce e
 * sobe entre dois ticks nunca esteve preso em nenhum, e sem a trava o tiro
 * sumia — raro num quadro de 16 ms, comum num de 50 ms.
 */
describe('a trava de aperto', () => {
  it('guarda o clique que desceu e subiu entre dois ticks', () => {
    const source = new FakeMouseSource()
    const tracker = trackHeldButtons(source)
    source.press(LEFT)
    source.release(LEFT)
    expect(tracker.buttons.fire).toBe(false)
    expect(takePress(tracker.buttons, 'fire')).toBe(true)
  })

  it('o aperto guardado vale por um tick só', () => {
    const source = new FakeMouseSource()
    const tracker = trackHeldButtons(source)
    source.press(LEFT)
    source.release(LEFT)
    takePress(tracker.buttons, 'fire')
    expect(takePress(tracker.buttons, 'fire')).toBe(false)
  })

  it('sem clique nenhum não há nada guardado', () => {
    expect(takePress(createHeldButtons(), 'fire')).toBe(false)
  })

  it('cada botão tem a própria trava', () => {
    const source = new FakeMouseSource()
    const tracker = trackHeldButtons(source)
    source.press(RIGHT)
    source.release(RIGHT)
    expect(takePress(tracker.buttons, 'fire')).toBe(false)
    expect(takePress(tracker.buttons, 'scope')).toBe(true)
  })
})

describe('holdButton', () => {
  it('na descida, prende e arma a trava de aperto não lido', () => {
    const buttons = createHeldButtons()
    holdButton(buttons, 'scope', true)
    expect([buttons.scope, buttons.scopePressedUnread]).toEqual([true, true])
  })

  it('na subida, solta e deixa a trava para o tick ler', () => {
    const buttons = createHeldButtons()
    holdButton(buttons, 'fire', true)
    holdButton(buttons, 'fire', false)
    expect([buttons.fire, takePress(buttons, 'fire')]).toEqual([false, true])
  })
})
