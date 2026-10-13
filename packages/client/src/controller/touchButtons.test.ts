import { describe, expect, it } from 'vitest'
import { crouchRequested } from './crouchPress.ts'
import { createHeldButtons, takePress } from './heldButtons.ts'
import { createHeldKeys } from './heldKeys.ts'
import { createHeldStick } from './heldStick.ts'
import { pressTouchButton, releaseTouchTargets, type TouchTargets } from './touchButtons.ts'

function targets(): TouchTargets {
  return { keys: createHeldKeys(), buttons: createHeldButtons(), stick: createHeldStick() }
}

describe('pressTouchButton', () => {
  it('o tiro segura e arma a trava: um toque curto ainda dispara', () => {
    const into = targets()
    pressTouchButton('fire', true, into)
    pressTouchButton('fire', false, into)
    expect(into.buttons.fire).toBe(false)
    expect(takePress(into.buttons, 'fire')).toBe(true)
  })

  it('a luneta passa pela mesma trava', () => {
    const into = targets()
    pressTouchButton('scope', true, into)
    expect(into.buttons.scope).toBe(true)
  })

  it('a lâmina segura enquanto o dedo está no botão: toque curto golpeia', () => {
    const into = targets()
    pressTouchButton('melee', true, into)
    expect(into.keys.melee).toBe(true)
    pressTouchButton('melee', false, into)
    expect(into.keys.melee).toBe(false)
  })

  /** O relato de 11/10: no toque não havia caminho de volta da lâmina para a sniper. */
  it('com a lâmina na mão, o botão dela volta à sniper e não golpeia', () => {
    const into = { ...targets(), bladeDrawn: () => true }
    pressTouchButton('melee', true, into)
    expect([into.buttons.primaryPressedUnread, into.keys.melee]).toEqual([true, false])
    pressTouchButton('melee', false, into)
    expect(into.keys.melee).toBe(false)
  })

  it('com a lâmina guardada, o botão dela continua sendo o da lâmina', () => {
    const into = { ...targets(), bladeDrawn: () => false }
    pressTouchButton('melee', true, into)
    expect([into.buttons.primaryPressedUnread, into.keys.melee]).toEqual([false, true])
  })

  it('pulo e recarga seguram enquanto o dedo está no botão', () => {
    const into = targets()
    pressTouchButton('jump', true, into)
    pressTouchButton('reload', true, into)
    expect([into.keys.jump, into.keys.reload]).toEqual([true, true])
    pressTouchButton('jump', false, into)
    expect(into.keys.jump).toBe(false)
  })

  it('o placar aparece enquanto o dedo está no botão', () => {
    const into = targets()
    pressTouchButton('scoreboard', true, into)
    expect(into.keys.scoreboard).toBe(true)
    pressTouchButton('scoreboard', false, into)
    expect(into.keys.scoreboard).toBe(false)
  })

  it('o gancho segura enquanto o dedo está no botão, como no teclado', () => {
    const into = targets()
    pressTouchButton('grapple', true, into)
    expect(into.keys.grapple).toBe(true)
    pressTouchButton('grapple', false, into)
    expect(into.keys.grapple).toBe(false)
  })

  /** Quem alterna é o núcleo (`crouch.ts`): alternar aqui também contaria cada toque duas vezes. */
  it('agachar segura enquanto o dedo está no botão, como o pulo', () => {
    const into = targets()
    pressTouchButton('crouch', true, into)
    expect(into.keys.crouch).toBe(true)
    pressTouchButton('crouch', false, into)
    expect(into.keys.crouch).toBe(false)
  })

  /** Revisão do PR #30: o toque que descia e subia entre dois ticks não agachava. */
  it('o toque curto em agachar arma a trava: ainda chega ao núcleo', () => {
    const into = targets()
    pressTouchButton('crouch', true, into)
    pressTouchButton('crouch', false, into)
    expect(crouchRequested(into.keys.crouch, into.buttons)).toBe(true)
  })

  it('soltar o dedo de agachar não arma a trava', () => {
    const into = targets()
    pressTouchButton('crouch', false, into)
    expect(into.buttons.crouchPressedUnread).toBe(false)
  })
})

describe('releaseTouchTargets', () => {
  it('solta teclas, botões, travas e o analógico', () => {
    const into = targets()
    pressTouchButton('crouch', true, into)
    pressTouchButton('fire', true, into)
    into.stick.ahead = 1
    releaseTouchTargets(into)
    expect([into.keys.crouch, into.buttons.fire, into.stick.ahead]).toEqual([false, false, 0])
    expect(takePress(into.buttons, 'fire')).toBe(false)
    expect(crouchRequested(into.keys.crouch, into.buttons)).toBe(false)
  })
})
