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

/**
 * Números que só fazem sentido em relação a outro. Um valor sozinho passa na
 * faixa da spec e ainda assim quebra a regra do jogo, e é aqui que isso falha.
 */
describe('as relações entre os números da arma', () => {
  const shipped = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

  /** Recarregar mais rápido que ciclar o ferrolho tornaria o ferrolho inútil. */
  it('a recarga custa mais que um ciclo de ferrolho', () => {
    expect(shipped.weapon.reloadS).toBeGreaterThan(shipped.weapon.boltCycleS)
  })

  /**
   * O quick scope do modelo de simulação: a precisão total chega **antes** de o
   * zoom terminar, e é isso que separa os dois tempos em chaves distintas.
   */
  it('a precisão da mira chega antes de o zoom terminar', () => {
    expect(shipped.weapon.scopeSettleS).toBeLessThan(shipped.camera.scopeTransitionS)
  })

  it('a mira fecha o fov em vez de abrir', () => {
    expect(shipped.camera.scopedFovDeg).toBeLessThan(shipped.camera.baseFovDeg)
  })

  /** Pilar 3: mirar é a única troca do jogo, e ela tem que custar velocidade. */
  it('mirar anda mais devagar que correr', () => {
    expect(shipped.weapon.scopedMoveSpeedMps).toBeLessThan(shipped.movement.runSpeedMps)
  })

  it('o campo de treino cabe nos spawns do greybox', () => {
    expect(shipped.match.trainingDummies).toBeLessThanOrEqual(12)
  })
})
