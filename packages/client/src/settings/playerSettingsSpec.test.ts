import { readFileSync } from 'node:fs'
import { GAMEPLAY_CONFIG_SPEC, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLAYER_SETTINGS,
  PLAYER_SETTINGS_SPEC,
  type PlayerSettings,
  specFor,
} from './playerSettingsSpec.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const shipped = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

describe('PLAYER_SETTINGS_SPEC', () => {
  it('tem uma linha por campo de PlayerSettings, sem sobra nem falta', () => {
    const keys = PLAYER_SETTINGS_SPEC.map((spec) => spec.key).sort()
    expect(keys).toEqual([
      'fieldOfViewDeg',
      'mouseSensitivity',
      'musicVolume',
      'narratorVoice',
      'narratorVolume',
      'scopeSensitivity',
      'sfxVolume',
    ])
  })

  it.each(PLAYER_SETTINGS_SPEC)('$key tem faixa, passo e padrão coerentes', (spec) => {
    expect(spec.minInclusive).toBeLessThan(spec.maxInclusive)
    expect(spec.step).toBeGreaterThan(0)
    expect(spec.fallback).toBeGreaterThanOrEqual(spec.minInclusive)
    expect(spec.fallback).toBeLessThanOrEqual(spec.maxInclusive)
  })

  it('a faixa toda é alcançável em passos inteiros', () => {
    for (const spec of PLAYER_SETTINGS_SPEC) {
      const passos = (spec.maxInclusive - spec.minInclusive) / spec.step
      expect(Math.abs(passos - Math.round(passos)), `${spec.key} não fecha no passo`).toBeLessThan(
        1e-9,
      )
    }
  })
})

/**
 * As três amarras entre o que o jogador escolhe e o que o jogo entrega. Sem
 * elas, dois lugares guardam a mesma verdade e divergem em silêncio — foi
 * exatamente o que aconteceu quando a cápsula subiu para 2 m e o spawn não.
 */
describe('a tabela contra o config entregue', () => {
  it('o padrão de campo de visão é o baseFovDeg do jogo, não um número repetido', () => {
    expect(specFor('fieldOfViewDeg').fallback).toBe(shipped.camera.baseFovDeg)
  })

  /**
   * A luneta **fecha** o campo. Um fov de jogador abaixo do `scopedFovDeg`
   * inverteria a mira, e `parseGameplayConfig.test.ts` só vigia isso sobre o
   * json — o valor do jogador passa longe daquele parser.
   */
  it('o piso do jogador fica acima do fov da luneta, senão mirar abriria o campo', () => {
    expect(specFor('fieldOfViewDeg').minInclusive).toBeGreaterThan(shipped.camera.scopedFovDeg)
  })

  it('a faixa do jogador cabe dentro da que o parser do jogo aceita', () => {
    const base = GAMEPLAY_CONFIG_SPEC.find(
      (field) => field.section === 'camera' && field.key === 'baseFovDeg',
    )
    const fov = specFor('fieldOfViewDeg')
    expect(fov.minInclusive).toBeGreaterThanOrEqual(base?.minInclusive ?? Number.NaN)
    expect(fov.maxInclusive).toBeLessThanOrEqual(base?.maxInclusive ?? Number.NaN)
  })
})

describe('DEFAULT_PLAYER_SETTINGS', () => {
  it('é montado a partir dos padrões da tabela, não escrito à mão', () => {
    for (const spec of PLAYER_SETTINGS_SPEC) {
      expect(DEFAULT_PLAYER_SETTINGS[spec.key]).toBe(spec.fallback)
    }
  })
})

describe('specFor', () => {
  it('recusa chave que não está na tabela, dizendo o que recebeu', () => {
    expect(() => specFor('inventada' as keyof PlayerSettings)).toThrow(/recebeu inventada/)
  })
})
