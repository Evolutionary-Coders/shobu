import type { GameplayConfig } from '@shobu/core'
import { isPerfMode } from '../instrumentation/perfMode.ts'
import { isWithinConfigSpec } from './configSpecRange.ts'

/**
 * `?matchS=30` na url encurta a partida **só para medir e capturar** o fim
 * dela — a tela de MVP e o voto —, sem esperar cinco minutos. Só junto com
 * `?perf=1`, como o `?tickHz=` (`tickHzOverride.ts`): a duração do jogo
 * continua sendo a do `config/gameplay.json` (ADR 0005).
 *
 * Valor fora da faixa que o parser aceita (de 30 s a uma hora) é ignorado.
 *
 * ```ts
 * withMatchLengthOverride(config, '?perf=1&matchS=30').match.durationS // 30
 * ```
 */
export function withMatchLengthOverride(config: GameplayConfig, search: string): GameplayConfig {
  if (!isPerfMode(search)) return config
  const durationS = Number(new URLSearchParams(search).get('matchS'))
  if (!isWithinConfigSpec('match', 'durationS', durationS)) return config
  return { ...config, match: { ...config.match, durationS } }
}
