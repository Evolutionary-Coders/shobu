import { decodeButtons, decodeMovementInput, IDLE_INPUT, IDLE_WEAPON_INPUT } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createWireInput, encodeTickInput } from './encodeTickInput.ts'

const LOOKING_EAST = { x: 1, y: 0, z: 0 }

describe('encodeTickInput', () => {
  it('leva direção, botões e mira do tick para o fio', () => {
    const wire = encodeTickInput(
      { ...IDLE_INPUT, wishX: 0.5, wishZ: -1, sprint: true, crouch: true, grapple: true },
      { ...IDLE_WEAPON_INPUT, fire: true, reload: true, melee: true },
      LOOKING_EAST,
      createWireInput(),
    )
    const movement = { ...IDLE_INPUT }
    decodeMovementInput(wire, movement)
    expect(movement).toMatchObject({
      wishX: 64 / 127,
      wishZ: -1,
      sprint: true,
      jump: false,
      crouch: true,
      grapple: true,
    })
    expect(decodeButtons(wire.buttons)).toMatchObject({
      fire: true,
      scope: false,
      reload: true,
      melee: true,
      primary: false,
    })
    expect(wire).toMatchObject({ aimX: 32767, aimY: 0, aimZ: 0 })
  })

  /** O servidor lê o input pelo mesmo `wireFormat`: o que sai daqui tem que voltar igual. */
  it('não deixa botão do tick anterior no rascunho', () => {
    const out = createWireInput()
    encodeTickInput({ ...IDLE_INPUT, jump: true }, IDLE_WEAPON_INPUT, LOOKING_EAST, out)
    encodeTickInput(IDLE_INPUT, IDLE_WEAPON_INPUT, LOOKING_EAST, out)
    expect(out.buttons).toBe(0)
  })

  it('escreve no objeto que recebe', () => {
    const out = createWireInput()
    expect(encodeTickInput(IDLE_INPUT, IDLE_WEAPON_INPUT, LOOKING_EAST, out)).toBe(out)
  })
})
