import { describe, expect, it } from 'vitest'
import { firstConnectedPad } from './connectedGamepad.ts'

describe('firstConnectedPad', () => {
  it('o primeiro conectado, pulando as vagas vazias e os desconectados', () => {
    const second = { connected: true, id: 'b' }
    expect(firstConnectedPad([null, { connected: false, id: 'a' }, second])).toBe(second)
  })

  it('sem controle, ou sem a api, nada', () => {
    expect(firstConnectedPad([null, null])).toBeUndefined()
    expect(firstConnectedPad(undefined)).toBeUndefined()
  })
})
