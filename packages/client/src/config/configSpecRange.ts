import { GAMEPLAY_CONFIG_SPEC, type GameplayConfig } from '@shobu/core'

/**
 * Se o valor cabe na faixa que o parser do jogo aceita para o campo
 * (`GAMEPLAY_CONFIG_SPEC`). É a guarda das trocas do modo de medição na url:
 * medir com um número que o jogo de verdade recusaria não mede o jogo.
 *
 * ```ts
 * isWithinConfigSpec('simulation', 'tickHz', 120) // true
 * isWithinConfigSpec('match', 'durationS', 5) // false: o mínimo é 30
 * ```
 */
export function isWithinConfigSpec(
  section: keyof GameplayConfig,
  key: string,
  value: number,
): boolean {
  const spec = GAMEPLAY_CONFIG_SPEC.find((field) => field.section === section && field.key === key)
  if (!spec || !Number.isFinite(value)) return false
  return value >= spec.minInclusive && value <= spec.maxInclusive
}
