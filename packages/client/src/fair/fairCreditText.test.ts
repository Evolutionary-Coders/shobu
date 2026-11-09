import { describe, expect, it } from 'vitest'
import { fairCreditText } from './fairCreditText.ts'

describe('fairCreditText', () => {
  it.each([
    [{ status: 'credited', bricks: 3 }, '+3 TIJOLINHOS NA FEIRA'],
    [{ status: 'credited', bricks: 1 }, '+1 TIJOLINHO NA FEIRA'],
    [{ status: 'signed-out', bricks: 2 }, 'ENTRE COM GOOGLE NO MENU PARA GANHAR 2 TIJOLINHOS'],
    [{ status: 'expired', bricks: 2 }, 'RENOVANDO O LOGIN PARA CREDITAR 2 TIJOLINHOS'],
    [{ status: 'failed', bricks: 2 }, 'NÃO FOI POSSÍVEL CREDITAR NA FEIRA'],
    [{ status: 'duplicate', bricks: 2 }, 'ESTA CONTA JÁ FOI CREDITADA NESTA PARTIDA'],
    [{ status: 'unavailable', bricks: 0 }, 'CRÉDITO DA FEIRA DESLIGADO NESTE SERVIDOR'],
    [{ status: 'none', bricks: 0 }, null],
  ] as const)('%j vira %j', (credit, text) => {
    expect(fairCreditText(credit)).toBe(text)
  })
})
