import { describe, expect, it } from 'vitest'
import { createHeldButtons } from './heldButtons.ts'
import { createHeldKeys } from './heldKeys.ts'
import { createWeaponInput, settleWeaponPresses, weaponInputFrom } from './weaponInputFrom.ts'

describe('weaponInputFrom', () => {
  it('o botão esquerdo vira pedido de tiro e o direito de mira', () => {
    const buttons = createHeldButtons()
    buttons.fire = true
    buttons.scope = true
    const input = weaponInputFrom(createHeldKeys(), buttons, createWeaponInput())
    expect(input).toEqual({
      fire: true,
      scope: true,
      aim: false,
      reload: false,
      melee: false,
      primary: false,
    })
  })

  it('o gatilho esquerdo do controle vira a mira de segurar, e o toque curto não some', () => {
    const buttons = createHeldButtons()
    buttons.aimPressedUnread = true
    const input = weaponInputFrom(createHeldKeys(), buttons, createWeaponInput())
    expect([input.aim, input.scope]).toEqual([true, false])
    settleWeaponPresses(buttons, input)
    expect(weaponInputFrom(createHeldKeys(), buttons, input).aim).toBe(false)
  })

  it('a tecla R vira pedido de recarga', () => {
    const keys = createHeldKeys()
    keys.reload = true
    expect(weaponInputFrom(keys, createHeldButtons(), createWeaponInput()).reload).toBe(true)
  })

  it('V vira o corpo a corpo, e a tecla 1 ou a roda voltam à sniper', () => {
    const keys = createHeldKeys()
    keys.melee = true
    expect(weaponInputFrom(keys, createHeldButtons(), createWeaponInput()).melee).toBe(true)
    keys.primary = true
    expect(weaponInputFrom(keys, createHeldButtons(), createWeaponInput()).primary).toBe(true)
    const buttons = createHeldButtons()
    buttons.primaryPressedUnread = true
    expect(weaponInputFrom(createHeldKeys(), buttons, createWeaponInput()).primary).toBe(true)
  })

  it('o giro da roda vale um tick só, depois que um tick o leu', () => {
    const buttons = createHeldButtons()
    buttons.primaryPressedUnread = true
    const input = weaponInputFrom(createHeldKeys(), buttons, createWeaponInput())
    settleWeaponPresses(buttons, input)
    expect(weaponInputFrom(createHeldKeys(), buttons, input).primary).toBe(false)
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

  /** O clique curto demais para estar preso em algum tick ainda chega. */
  it('entrega o aperto guardado enquanto nenhum tick o leu', () => {
    const input = createWeaponInput()
    const buttons = createHeldButtons()
    buttons.firePressedUnread = true
    expect(weaponInputFrom(createHeldKeys(), buttons, input).fire).toBe(true)
    // um quadro sem tick: o aperto continua lá para o próximo.
    expect(weaponInputFrom(createHeldKeys(), buttons, input).fire).toBe(true)
  })

  it('a luneta guardada também chega', () => {
    const buttons = createHeldButtons()
    buttons.scopePressedUnread = true
    expect(weaponInputFrom(createHeldKeys(), buttons, createWeaponInput()).scope).toBe(true)
  })
})

describe('settleWeaponPresses', () => {
  /** Validação da `dev` (10/10): a 144 Hz o clique curto caía num quadro sem tick e sumia. */
  it('depois de um tick, o aperto guardado vale uma vez só', () => {
    const input = createWeaponInput()
    const buttons = createHeldButtons()
    buttons.firePressedUnread = true
    buttons.scopePressedUnread = true
    weaponInputFrom(createHeldKeys(), buttons, input)
    settleWeaponPresses(buttons, input)
    expect(weaponInputFrom(createHeldKeys(), buttons, input)).toEqual({
      fire: false,
      scope: false,
      aim: false,
      reload: false,
      melee: false,
      primary: false,
    })
  })

  it('o aperto que chegou depois de a entrada ser montada fica para o próximo tick', () => {
    const input = createWeaponInput()
    const buttons = createHeldButtons()
    weaponInputFrom(createHeldKeys(), buttons, input)
    buttons.firePressedUnread = true
    settleWeaponPresses(buttons, input)
    expect(weaponInputFrom(createHeldKeys(), buttons, input).fire).toBe(true)
  })
})
