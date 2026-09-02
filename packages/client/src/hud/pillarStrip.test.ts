import { readFileSync } from 'node:fs'
import { type GameplayConfig, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { buildPillarStrip } from './pillarStrip.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)

function shippedConfig(): GameplayConfig {
  return parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
}

describe('buildPillarStrip', () => {
  it('anuncia as três regras que são pilar, não ajuste de balanceamento', () => {
    expect(buildPillarStrip(shippedConfig())).toEqual([
      'UM TIRO MATA',
      'SEM PROGRESSÃO',
      'PISO 9 m/s',
    ])
  })

  it('tira a velocidade da config em vez de repetir número fixo', () => {
    const config = shippedConfig()
    const faster = { ...config, movement: { ...config.movement, runSpeedMps: 12 } }
    expect(buildPillarStrip(faster)).toContain('PISO 12 m/s')
  })

  /**
   * Estrutura paralela: três regras no mesmo ritmo, sem dois-pontos e sem uma
   * fora do formato. `m/s` fica minúsculo porque é unidade do SI, não prosa.
   */
  it('mantém as três frases no mesmo formato', () => {
    for (const phrase of buildPillarStrip(shippedConfig())) {
      expect(phrase).not.toContain(':')
      const prose = phrase.replace(/\d+ m\/s/, '')
      expect(prose).toBe(prose.toUpperCase())
    }
  })
})
