import { describe, expect, it } from 'vitest'
import { botSeatsFor } from './roomSeats.ts'

describe('botSeatsFor', () => {
  it('o jogador sozinho numa sala de quatro ganha três bots', () => {
    expect(botSeatsFor(4, 1)).toBe(3)
  })

  it('cada humano que entra tira um bot', () => {
    expect([0, 1, 2, 3, 4].map((humans) => botSeatsFor(4, humans))).toEqual([4, 3, 2, 1, 0])
  })

  /** Recusar o quinto jogador é do servidor; a conta só não pede bot negativo. */
  it('sala mais que cheia não pede bot nenhum', () => {
    expect(botSeatsFor(4, 6)).toBe(0)
  })

  it.each([
    [4.5, 1, 'playersPerRoom 4.5'],
    [-1, 1, 'playersPerRoom -1'],
    [4, -2, 'humans -2'],
    [4, Number.NaN, 'humans NaN'],
  ])('recusa contagem que não é inteiro >= 0 (%s, %s)', (rooms, humans, label) => {
    expect(() => botSeatsFor(rooms, humans)).toThrow(new RegExp(`${label}; esperado inteiro >= 0`))
  })
})
