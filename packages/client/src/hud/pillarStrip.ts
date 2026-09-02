import type { GameplayConfig } from '@shobu/core'

/**
 * As três regras que são pilar (docs/pillars.md), na forma de tira sob o logo.
 *
 * Não passa pelo `TerminalPrinter` de propósito. Isto não é saída de boot: é
 * parte do lockup do título, como o bloco de créditos de um cartaz, e chega
 * inteiro junto com o slam em vez de ser datilografado. Impresso letra a letra
 * e em tamanho de display, competia com o logo pelo mesmo centro de atenção e
 * ainda custava meio segundo do orçamento do pilar 2.
 *
 * ```ts
 * buildPillarStrip(config) // ['UM TIRO MATA', 'SEM PROGRESSÃO', 'PISO 9 m/s']
 * ```
 */
export function buildPillarStrip(config: GameplayConfig): readonly string[] {
  return ['UM TIRO MATA', 'SEM PROGRESSÃO', `PISO ${config.movement.runSpeedMps} m/s`]
}
