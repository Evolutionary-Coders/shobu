import { describe, expect, it } from 'vitest'
import type { GamepadSnapshot } from '../controller/gamepadInput.ts'
import {
  createGamepadMenuReader,
  MENU_REPEAT_DELAY_MS,
  MENU_REPEAT_EVERY_MS,
} from './gamepadMenu.ts'

/** Um gamepad "standard" de mentira, com os botões e eixos pedidos. */
function pad(pressed: readonly number[] = [], axes: readonly number[] = [0, 0]): GamepadSnapshot {
  return {
    axes,
    buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: pressed.includes(index) })),
  }
}

describe('createGamepadMenuReader', () => {
  it('A confirma, B volta, o direcional anda', () => {
    const reader = createGamepadMenuReader()
    expect(reader.read(pad([0]), 0)).toEqual(['activate'])
    expect(reader.read(pad([1]), 10)).toEqual(['back'])
    expect(reader.read(pad([12]), 20)).toEqual(['up'])
    expect(reader.read(pad([15]), 30)).toEqual(['right'])
  })

  it('o analógico esquerdo, passado de meio curso, também anda', () => {
    const reader = createGamepadMenuReader()
    expect(reader.read(pad([], [0, 0.9]), 0)).toEqual(['down'])
    expect(reader.read(pad([], [-0.9, 0]), 10)).toEqual(['left'])
    expect(reader.read(pad([], [0, -0.9]), 20)).toEqual(['up'])
    expect(reader.read(pad([], [0.9, 0]), 30)).toEqual(['right'])
  })

  it('analógico em menos de meio curso não anda', () => {
    expect(createGamepadMenuReader().read(pad([], [0.3, -0.3]), 0)).toEqual([])
  })

  it('confirmar preso não confirma de novo', () => {
    const reader = createGamepadMenuReader()
    reader.read(pad([0]), 0)
    expect(reader.read(pad([0]), MENU_REPEAT_DELAY_MS * 3)).toEqual([])
  })

  it('direção presa espera e depois repete', () => {
    const reader = createGamepadMenuReader()
    expect(reader.read(pad([13]), 0)).toEqual(['down'])
    expect(reader.read(pad([13]), MENU_REPEAT_DELAY_MS - 1)).toEqual([])
    expect(reader.read(pad([13]), MENU_REPEAT_DELAY_MS)).toEqual(['down'])
    expect(reader.read(pad([13]), MENU_REPEAT_DELAY_MS + 1)).toEqual([])
    expect(reader.read(pad([13]), MENU_REPEAT_DELAY_MS + MENU_REPEAT_EVERY_MS)).toEqual(['down'])
  })

  it('soltar e apertar de novo vale na hora', () => {
    const reader = createGamepadMenuReader()
    reader.read(pad([0]), 0)
    reader.read(pad(), 10)
    expect(reader.read(pad([0]), 20)).toEqual(['activate'])
  })

  it('sem gamepad, nada; e o que estava preso fica solto', () => {
    const reader = createGamepadMenuReader()
    reader.read(pad([12]), 0)
    expect(reader.read(undefined, 10)).toEqual([])
    expect(reader.read(pad([12]), 20)).toEqual(['up'])
  })

  it('gamepad sem eixos nem todos os botões não quebra', () => {
    expect(createGamepadMenuReader().read({ axes: [], buttons: [{ pressed: true }] }, 0)).toEqual([
      'activate',
    ])
  })
})
