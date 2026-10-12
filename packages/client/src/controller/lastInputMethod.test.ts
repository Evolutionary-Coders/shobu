import { describe, expect, it } from 'vitest'
import type { GamepadSnapshot } from './gamepadInput.ts'
import {
  createInputMethodTracker,
  GAMEPAD_ACTIVE_AXIS,
  isGamepadActive,
  noteGamepad,
  noteKeyboard,
  notePointer,
} from './lastInputMethod.ts'

/** Um controle de mentira, parado: dezessete botões soltos e quatro eixos no centro. */
function restingPad(): { axes: number[]; buttons: { pressed: boolean }[] } {
  return { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) }
}

describe('a última entrada usada', () => {
  it('nasce no teclado', () => {
    expect(createInputMethodTracker().method).toBe('keyboard')
  })

  it('o dedo vira toque, e o mouse e a caneta voltam ao teclado', () => {
    const tracker = createInputMethodTracker()
    notePointer(tracker, 'touch')
    expect(tracker.method).toBe('touch')
    notePointer(tracker, 'mouse')
    expect(tracker.method).toBe('keyboard')
    notePointer(tracker, 'touch')
    notePointer(tracker, 'pen')
    expect(tracker.method).toBe('keyboard')
  })

  it('um botão apertado no controle vira controle, e a tecla seguinte volta', () => {
    const tracker = createInputMethodTracker()
    const pad = restingPad()
    pad.buttons[12] = { pressed: true }
    noteGamepad(tracker, pad)
    expect(tracker.method).toBe('gamepad')
    noteKeyboard(tracker)
    expect(tracker.method).toBe('keyboard')
  })

  /** O controle esquecido ligado na mesa não pode tomar a dica do teclado. */
  it('controle conectado e parado, ou ausente, não muda nada', () => {
    const tracker = createInputMethodTracker('touch')
    noteGamepad(tracker, restingPad())
    noteGamepad(tracker, undefined)
    expect(tracker.method).toBe('touch')
  })
})

describe('isGamepadActive', () => {
  it('o analógico empurrado conta; a deriva de repouso, não', () => {
    const pad: GamepadSnapshot = { ...restingPad(), axes: [0, 0, GAMEPAD_ACTIVE_AXIS, 0] }
    expect(isGamepadActive(pad)).toBe(true)
    expect(isGamepadActive({ ...restingPad(), axes: [0.1, -0.12, 0, 0] })).toBe(false)
  })
})
