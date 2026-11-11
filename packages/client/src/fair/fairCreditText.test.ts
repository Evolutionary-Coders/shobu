import { describe, expect, it } from 'vitest'
import { fairCreditText } from './fairCreditText.ts'

describe('fairCreditText', () => {
  it.each([
    [{ status: 'credited', bricks: 3 }, '+3 TIJOLINHOS NA FEIRA'],
    [{ status: 'credited', bricks: 1 }, '+1 TIJOLINHO NA FEIRA'],
    [
      { status: 'anonymous', bricks: 2 },
      'COLOQUE SEU ID DA FEIRA NO MENU PARA GANHAR 2 TIJOLINHOS',
    ],
    [{ status: 'unknown-user', bricks: 2 }, 'ID DA FEIRA NÃO ENCONTRADO: CONFIRA NO MENU'],
    [{ status: 'failed', bricks: 2 }, 'NÃO FOI POSSÍVEL CREDITAR NA FEIRA'],
    [{ status: 'duplicate', bricks: 2 }, 'ESTE ID JÁ FOI CREDITADO NESTA PARTIDA'],
    [{ status: 'unavailable', bricks: 0 }, 'CRÉDITO DA FEIRA DESLIGADO NESTE SERVIDOR'],
    [{ status: 'none', bricks: 0 }, null],
  ] as const)('%j vira %j', (credit, text) => {
    expect(fairCreditText(credit)).toBe(text)
  })
})
