import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GAMEPLAY_CONFIG_SPEC } from './gameplayConfigSpec.ts'
import { parseGameplayConfig } from './parseGameplayConfig.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)

/** Config válida derivada da própria spec, para o teste não envelhecer com ela. */
function validConfig(): Record<string, Record<string, number>> {
  const config: Record<string, Record<string, number>> = {}
  for (const spec of GAMEPLAY_CONFIG_SPEC) {
    const section = config[spec.section] ?? {}
    section[spec.key] = (spec.minInclusive + spec.maxInclusive) / 2
    config[spec.section] = section
  }
  return config
}

describe('parseGameplayConfig', () => {
  it('aceita uma config com todas as chaves da spec dentro da faixa', () => {
    expect(() => parseGameplayConfig(validConfig())).not.toThrow()
  })

  it('aceita o config/gameplay.json versionado no repositório', () => {
    const shipped: unknown = JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8'))
    expect(() => parseGameplayConfig(shipped)).not.toThrow()
  })

  it('rejeita chave desconhecida, que é como um rename passaria em silêncio', () => {
    const config = validConfig()
    config.movement = { ...config.movement, runSpeedMS: 8 }
    expect(() => parseGameplayConfig(config)).toThrow(/runSpeedMS/)
  })

  it('rejeita seção desconhecida', () => {
    expect(() => parseGameplayConfig({ ...validConfig(), audio: {} })).toThrow(/audio/)
  })

  it('rejeita chave ausente citando o caminho', () => {
    const config = validConfig()
    delete config.movement?.runSpeedMps
    expect(() => parseGameplayConfig(config)).toThrow(/movement\.runSpeedMps/)
  })

  it('rejeita valor fora da faixa citando o valor recebido', () => {
    const config = validConfig()
    config.camera = { ...config.camera, baseFovDeg: 400 }
    expect(() => parseGameplayConfig(config)).toThrow(/400/)
  })

  it('rejeita valor não numérico', () => {
    const config = validConfig()
    config.match = { ...config.match, durationS: '300' as unknown as number }
    expect(() => parseGameplayConfig(config)).toThrow(/match\.durationS/)
  })

  it.each([null, 42, 'config', []])('rejeita raiz que não é objeto: %p', (raw) => {
    expect(() => parseGameplayConfig(raw)).toThrow(/esperado objeto/)
  })
})
