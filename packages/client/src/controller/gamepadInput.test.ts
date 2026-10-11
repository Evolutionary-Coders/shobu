import { describe, expect, it } from 'vitest'
import {
  createGamepadReader,
  type GamepadSnapshot,
  type GamepadTargets,
  HEAD_BUTTON,
  TRIGGER_PRESS_VALUE,
} from './gamepadInput.ts'
import { createHeldButtons, takePress } from './heldButtons.ts'
import { createHeldKeys } from './heldKeys.ts'
import { createHeldStick } from './heldStick.ts'

/** Um gamepad "standard" de mentira: 17 botões soltos e o analógico no centro. */
class FakeGamepad implements GamepadSnapshot {
  readonly axes = [0, 0, 0, 0]
  readonly buttons: { pressed: boolean; value?: number }[] = Array.from({ length: 17 }, () => ({
    pressed: false,
  }))

  press(...indices: number[]): this {
    for (const index of indices) this.buttons[index] = { pressed: true }
    return this
  }

  release(...indices: number[]): this {
    for (const index of indices) this.buttons[index] = { pressed: false }
    return this
  }

  tilt(x: number, y: number): this {
    this.axes[0] = x
    this.axes[1] = y
    return this
  }

  aim(x: number, y: number): this {
    this.axes[2] = x
    this.axes[3] = y
    return this
  }
}

function targets(): GamepadTargets {
  return {
    keys: createHeldKeys(),
    buttons: createHeldButtons(),
    stick: createHeldStick(),
    look: createHeldStick(),
  }
}

describe('createGamepadReader', () => {
  it('segue o contrato: A pula, B agacha, X recarrega, clique do analógico corre', () => {
    const into = targets()
    createGamepadReader().read(new FakeGamepad().press(0, 1, 2, 10), into)
    const { jump, crouch, reload, sprint } = into.keys
    expect([jump, crouch, reload, sprint]).toEqual([true, true, true, true])
  })

  /** O VIEW do xbox, o SHARE do playstation: o placar enquanto o botão está preso. */
  it('o botão de trás segura o placar, e soltar o esconde', () => {
    const into = targets()
    const reader = createGamepadReader()
    const pad = new FakeGamepad().press(8)
    reader.read(pad, into)
    expect(into.keys.scoreboard).toBe(true)
    reader.read(pad.release(8), into)
    expect(into.keys.scoreboard).toBe(false)
  })

  it('R1 atira e L1 mira, com a trava de aperto armada', () => {
    const into = targets()
    createGamepadReader().read(new FakeGamepad().press(5, 4), into)
    expect([into.buttons.fire, into.buttons.scope]).toEqual([true, true])
    expect([takePress(into.buttons, 'fire'), takePress(into.buttons, 'scope')]).toEqual([
      true,
      true,
    ])
  })

  it('R2 e L2 também valem, para testar com controle de console', () => {
    const into = targets()
    createGamepadReader().read(new FakeGamepad().press(7, 6), into)
    expect([into.buttons.fire, into.buttons.scope]).toEqual([true, true])
  })

  it('soltar um dos dois botões da mesma ação não solta a ação', () => {
    const reader = createGamepadReader()
    const into = targets()
    const pad = new FakeGamepad().press(5, 7)
    reader.read(pad, into)
    reader.read(pad.release(7), into)
    expect(into.buttons.fire).toBe(true)
    reader.read(pad.release(5), into)
    expect(into.buttons.fire).toBe(false)
  })

  it('escreve só na borda: não apaga o que o teclado prendeu', () => {
    const reader = createGamepadReader()
    const into = targets()
    const pad = new FakeGamepad()
    reader.read(pad, into)
    into.keys.jump = true
    reader.read(pad, into)
    expect(into.keys.jump).toBe(true)
  })

  it('o analógico escreve o estado do stick', () => {
    const into = targets()
    createGamepadReader().read(new FakeGamepad().tilt(0, -1), into)
    expect(into.stick.ahead).toBeCloseTo(1)
  })

  it('o analógico direito escreve o estado de olhar, sem mexer no de andar', () => {
    const into = targets()
    createGamepadReader().read(new FakeGamepad().aim(1, 0), into)
    expect(into.look.side).toBeCloseTo(1)
    expect(into.stick).toEqual({ ahead: 0, side: 0 })
  })

  it('gamepad que some solta o que ele segurava, e só isso', () => {
    const reader = createGamepadReader()
    const into = targets()
    reader.read(new FakeGamepad().press(0, 5).tilt(1, 0).aim(0, -1), into)
    into.keys.forward = true
    reader.read(undefined, into)
    expect([into.keys.jump, into.buttons.fire, into.keys.forward]).toEqual([false, false, true])
    expect(into.stick).toEqual({ ahead: 0, side: 0 })
    expect(into.look).toEqual({ ahead: 0, side: 0 })
  })

  it('devolve se o botão da cabeça está preso, quadro a quadro', () => {
    const reader = createGamepadReader()
    const into = targets()
    const pad = new FakeGamepad().press(HEAD_BUTTON)
    expect(reader.read(pad, into)).toBe(true)
    expect(reader.read(pad, into)).toBe(true)
    expect(reader.read(pad.release(HEAD_BUTTON), into)).toBe(false)
    expect(reader.read(undefined, into)).toBe(false)
  })

  it('o A visto pelo menu e que chega aqui já armado não vira pulo (revisão do #17)', () => {
    const into = targets()
    const reader = createGamepadReader()
    reader.read(new FakeGamepad(), into, false)
    reader.read(new FakeGamepad().press(0), into, true)
    expect(into.keys.jump).toBe(false)
  })

  it('o gatilho analógico só atira a partir de meio curso', () => {
    const into = targets()
    const reader = createGamepadReader()
    const pad = new FakeGamepad()
    pad.buttons[7] = { pressed: true, value: 0.15 }
    reader.read(pad, into)
    expect(into.buttons.fire).toBe(false)
    pad.buttons[7] = { pressed: true, value: TRIGGER_PRESS_VALUE }
    reader.read(pad, into)
    expect(into.buttons.fire).toBe(true)
  })

  it('desarmado, no menu, não escreve nada: nem botão nem analógico', () => {
    const into = targets()
    createGamepadReader().read(new FakeGamepad().press(0, 5).tilt(0, -1).aim(1, 0), into, false)
    expect([into.keys.jump, into.buttons.fire]).toEqual([false, false])
    expect([into.stick.ahead, into.look.side]).toEqual([0, 0])
  })

  it('o A que confirmou o menu não vira pulo: vale só o próximo aperto', () => {
    const into = targets()
    const reader = createGamepadReader()
    const pad = new FakeGamepad().press(0)
    reader.read(pad, into, false)
    reader.read(pad, into)
    expect(into.keys.jump).toBe(false)
    reader.read(pad.release(0), into)
    reader.read(pad.press(0), into)
    expect(into.keys.jump).toBe(true)
  })

  it('desarmar solta o que estava preso na partida', () => {
    const into = targets()
    const reader = createGamepadReader()
    const pad = new FakeGamepad().press(5)
    reader.read(pad, into)
    reader.read(pad, into, false)
    expect(into.buttons.fire).toBe(false)
  })

  it('gamepad com menos botões e eixos que o standard não quebra', () => {
    const into = targets()
    const tiny: GamepadSnapshot = { axes: [], buttons: [{ pressed: true }] }
    expect(createGamepadReader().read(tiny, into)).toBe(false)
    expect([into.keys.jump, into.stick.ahead]).toEqual([true, 0])
  })
})
