import { GAMEPLAY_CONFIG_SPEC, type GameplayConfig } from '@shobu/core'

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
  const params = new URLSearchParams(search)
  if (params.get('perf') !== '1') return config
  const tickHz = Number(params.get('tickHz'))
  if (!isAcceptedTickHz(tickHz)) return config
  return { ...config, simulation: { ...config.simulation, tickHz } }
}

function isAcceptedTickHz(tickHz: number): boolean {
  const spec = GAMEPLAY_CONFIG_SPEC.find(
    (field) => field.section === 'simulation' && field.key === 'tickHz',
  )
  if (!spec || !Number.isInteger(tickHz)) return false
  return tickHz >= spec.minInclusive && tickHz <= spec.maxInclusive
}
