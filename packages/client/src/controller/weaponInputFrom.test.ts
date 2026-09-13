import { describe, expect, it } from 'vitest'
import { createHeldButtons } from './heldButtons.ts'
import { createHeldKeys } from './heldKeys.ts'
import { createWeaponInput, weaponInputFrom } from './weaponInputFrom.ts'

describe('weaponInputFrom', () => {
  it('o botão esquerdo vira pedido de tiro e o direito de mira', () => {
    const buttons = createHeldButtons()
    buttons.fire = true
    buttons.scope = true
    const input = weaponInputFrom(createHeldKeys(), buttons, createWeaponInput())
    expect(input).toEqual({ fire: true, scope: true, reload: false })
  })

  it('a tecla R vira pedido de recarga', () => {
    const keys = createHeldKeys()
    keys.reload = true
    expect(weaponInputFrom(keys, createHeldButtons(), createWeaponInput()).reload).toBe(true)
  })

  it('reaproveita a entrada recebida, sem alocar por quadro', () => {
    const input = createWeaponInput()
    expect(weaponInputFrom(createHeldKeys(), createHeldButtons(), input)).toBe(input)
  })

  /** Soltar tem que apagar o pedido: senão o tiro fica preso depois do esc. */
  it('soltar tudo zera a entrada', () => {
    const input = createWeaponInput()
    const buttons = createHeldButtons()
    buttons.fire = true
    weaponInputFrom(createHeldKeys(), buttons, input)
    buttons.fire = false
    expect(weaponInputFrom(createHeldKeys(), buttons, input).fire).toBe(false)
  })

  /** O clique curto demais para estar preso em algum tick ainda chega, por um tick. */
  it('entrega o aperto guardado por exatamente um tick', () => {
    const input = createWeaponInput()
    const buttons = createHeldButtons()
    buttons.firePressedUnread = true
    expect(weaponInputFrom(createHeldKeys(), buttons, input).fire).toBe(true)
    expect(weaponInputFrom(createHeldKeys(), buttons, input).fire).toBe(false)
  })
})
