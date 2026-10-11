import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAYER_SKIN, HUMAN_SKINS } from '../character/humanSkins.ts'
import { CHARACTER_SKINS } from './characterSkins.ts'

describe('characterSkins', () => {
  it('a padrão do jogador é o índice zero, que a classe sem escolha guarda', () => {
    expect(CHARACTER_SKINS[0]?.id).toBe(DEFAULT_PLAYER_SKIN)
  })

  it('oferece cada humano do catálogo uma vez, com o nome em caixa alta', () => {
    expect(CHARACTER_SKINS.map((skin) => skin.id).sort()).toEqual(
      HUMAN_SKINS.map((skin) => skin.id).sort(),
    )
    expect(CHARACTER_SKINS.find((skin) => skin.id === 'vex')?.label).toBe('VEX')
  })
})
