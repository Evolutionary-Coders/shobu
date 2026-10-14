import type { BotSkillConfig, GameplayConfig } from '../config/gameplayConfig.ts'

/**
 * O nível dos bots que o jogador escolhe no menu. É preferência de quem joga,
 * como a sensibilidade, e por isso não mora no `gameplay.json`; os **números**
 * de cada nível moram lá (`botSkillEasy`, `botSkillNormal`, `botSkillHard`),
 * validados como todo número de balanço (ADR 0005).
 */
export type BotDifficulty = 'easy' | 'normal' | 'hard'

/** Na ordem da seta do menu: do mais fácil ao mais difícil. */
export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'normal', 'hard']

/**
 * Os números do nível pedido.
 *
 * ```ts
 * botSkillFor(config, 'normal').reactionS // 0.85
 * ```
 */
export function botSkillFor(config: GameplayConfig, difficulty: BotDifficulty): BotSkillConfig {
  if (difficulty === 'easy') return config.botSkillEasy
  if (difficulty === 'hard') return config.botSkillHard
  return config.botSkillNormal
}
