import type { GameplayConfig } from '@shobu/core'
import { isPerfMode } from '../instrumentation/perfMode.ts'
import { isWithinConfigSpec } from './configSpecRange.ts'

/**
 * `?tickHz=120` na url troca a taxa da simulação **só para comparar** — e só
 * junto com `?perf=1`, o modo de medição. O padrão continua sendo o do
 * `config/gameplay.json` (ADR 0005): esta é a ferramenta para decidir se ele
 * muda, não a mudança.
 *
 * Valor fora da faixa que o parser do jogo aceita é ignorado: a medição não
 * pode rodar com um tick que o jogo de verdade recusaria.
 *
 * ```ts
 * withTickHzOverride(config, '?perf=1&tickHz=120').simulation.tickHz // 120
 * ```
 */
export function withTickHzOverride(config: GameplayConfig, search: string): GameplayConfig {
  if (!isPerfMode(search)) return config
  const tickHz = Number(new URLSearchParams(search).get('tickHz'))
  if (!isAcceptedTickHz(tickHz)) return config
  return { ...config, simulation: { ...config.simulation, tickHz } }
}

function isAcceptedTickHz(tickHz: number): boolean {
  return Number.isInteger(tickHz) && isWithinConfigSpec('simulation', 'tickHz', tickHz)
}
