import { BOT_DIFFICULTIES, type BotDifficulty } from '@shobu/core'

/**
 * O nível dos bots como o menu o mostra. O valor guardado nas configurações é
 * o índice em `BOT_DIFFICULTIES`, do mais fácil ao mais difícil — a mesma
 * ordem destes rótulos e a mesma da seta.
 */
export const BOT_DIFFICULTY_LABELS: readonly string[] = ['FÁCIL', 'NORMAL', 'DIFÍCIL']

/**
 * O nível do índice do ajuste. Índice fora da lista cai no normal: o ajuste
 * já chega recortado (`parsePlayerSettings`), e isto é só a última guarda.
 *
 * ```ts
 * botDifficultyAt(settings.botDifficulty) // 'normal'
 * ```
 */
export function botDifficultyAt(index: number): BotDifficulty {
  return BOT_DIFFICULTIES[index] ?? 'normal'
}
