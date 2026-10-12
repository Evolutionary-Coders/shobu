import { createSeededRandom, nextUnit } from '../math/seededRandom.ts'

/**
 * Os apelidos dos bots: competidores descartáveis de um torneio pirata, no
 * tom do resto do jogo (ADR 0013). Todos cabem no killfeed sem reticências
 * (`KILLFEED_NAME_MAX`, 12) e nenhum é `VOCÊ`, que é o jogador local.
 */
export const BOT_CALLSIGNS: readonly string[] = [
  'ONRYO',
  'KAGE',
  'RONIN-9',
  'NEON KITSUNE',
  'YUREI',
  'TETSU',
  'RAIJIN',
  'SAIBA',
  'GLITCH',
  'HEXKILL',
  'CHROME-ONI',
  'NULLBYTE',
  'SHIRO',
  'VOLT',
  'MONO-7',
  'ZERO DAY',
]

/**
 * `count` apelidos distintos, sorteados pela semente: a mesma partida dá os
 * mesmos nomes, no cliente e no servidor. Embaralhamento de Fisher-Yates sobre
 * uma cópia da lista — aloca, mas uma vez por sala, não por tick.
 *
 * ```ts
 * botCallsigns(3, 20251119) // ['TETSU', 'ONRYO', 'VOLT']
 * ```
 */
export function botCallsigns(count: number, seed: number): readonly string[] {
  if (!Number.isInteger(count) || count < 0 || count > BOT_CALLSIGNS.length) {
    throw new RangeError(
      `botCallsigns recebeu count ${count}; esperado inteiro de 0 a ${BOT_CALLSIGNS.length}`,
    )
  }
  const pool = [...BOT_CALLSIGNS]
  const rng = createSeededRandom(seed)
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(nextUnit(rng) * (index + 1))
    const kept = pool[index] as string
    pool[index] = pool[swap] as string
    pool[swap] = kept
  }
  return pool.slice(0, count)
}
