import { BOT_DIFFICULTIES } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { BOT_DIFFICULTY_LABELS, botDifficultyAt } from './botDifficultySetting.ts'
import { DEFAULT_PLAYER_SETTINGS, specFor } from './playerSettingsSpec.ts'

describe('botDifficultyAt', () => {
  it('lê o nível na ordem do menu', () => {
    expect([0, 1, 2].map(botDifficultyAt)).toEqual(['easy', 'normal', 'hard'])
  })

  it('índice fora da lista cai no normal', () => {
    expect([-1, 3, 0.5].map(botDifficultyAt)).toEqual(['normal', 'normal', 'normal'])
  })
})

describe('o ajuste de dificuldade', () => {
  it('tem um rótulo por nível', () => {
    expect(BOT_DIFFICULTY_LABELS).toHaveLength(BOT_DIFFICULTIES.length)
  })

  /** Quem chega no estande joga o normal sem abrir o menu. */
  it('começa no normal', () => {
    expect(botDifficultyAt(DEFAULT_PLAYER_SETTINGS.botDifficulty)).toBe('normal')
    expect(specFor('botDifficulty').choices).toBe(BOT_DIFFICULTY_LABELS)
  })
})
