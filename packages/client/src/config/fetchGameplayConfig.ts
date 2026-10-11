import { type GameplayConfig, parseGameplayConfig } from '@shobu/core'

/**
 * Carrega os números de gameplay servidos pelo `gameplayConfigPlugin`.
 * Falha ruidosamente: a ADR 0005 prefere o jogo não abrir a abrir com número
 * ausente, porque número errado só aparece como bug de feel meia hora depois.
 *
 * ```ts
 * const config = await fetchGameplayConfig('/gameplay.json')
 * ```
 */
export async function fetchGameplayConfig(url: string): Promise<GameplayConfig> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`GET ${url} respondeu ${response.status}; esperado 200 com json de gameplay`)
  }
  return parseGameplayConfig(await response.json())
}
