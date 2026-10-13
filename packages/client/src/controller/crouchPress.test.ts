import { describe, expect, it } from 'vitest'
import { crouchRequested, latchCrouchPress, settleCrouchPress } from './crouchPress.ts'
import { createHeldButtons, releaseAllButtons } from './heldButtons.ts'

describe('crouchPress', () => {
  it('a tecla presa pede agachar sem trava nenhuma', () => {
    expect(crouchRequested(true, createHeldButtons())).toBe(true)
    expect(crouchRequested(false, createHeldButtons())).toBe(false)
  })

  /** O toque que desce e sobe entre dois ticks não chegava ao núcleo (revisão do PR #30). */
  it('o toque travado continua pedindo agachar até um tick o ler', () => {
    const buttons = createHeldButtons()
    latchCrouchPress(buttons)
    expect(crouchRequested(false, buttons)).toBe(true)
    settleCrouchPress(buttons, { crouch: true })
    expect(crouchRequested(false, buttons)).toBe(false)
  })

  it('um quadro que não leu o agachar não consome a trava', () => {
    const buttons = createHeldButtons()
    settleCrouchPress(buttons, { crouch: false })
    latchCrouchPress(buttons)
    settleCrouchPress(buttons, { crouch: false })
    expect(buttons.crouchPressedUnread).toBe(true)
  })

  it('soltar tudo desarma a trava', () => {
    const buttons = createHeldButtons()
    latchCrouchPress(buttons)
    releaseAllButtons(buttons)
    expect(buttons.crouchPressedUnread).toBe(false)
  })
})
