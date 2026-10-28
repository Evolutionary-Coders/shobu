import { describe, expect, it } from 'vitest'
import { config } from '../bots/botTestKit.ts'
import { GAMEPLAY_CONFIG_SPEC } from '../config/gameplayConfigSpec.ts'
import {
  findScorestreak,
  SCORESTREAK_CATALOG,
  type ScorestreakSlug,
  scorestreakBySlug,
  scorestreakCost,
} from './scorestreakCatalog.ts'

describe('catálogo de séries de pontuação', () => {
  it('tem as doze da ADR 0029, sem repetir slug', () => {
    expect(SCORESTREAK_CATALOG).toHaveLength(12)
    expect(new Set(SCORESTREAK_CATALOG.map((streak) => streak.slug)).size).toBe(12)
  })

  it('cada chave de custo existe no config, e cada chave do config tem série', () => {
    // a chave sem série é número que ninguém lê; a série sem chave é custo `undefined`.
    const specKeys = GAMEPLAY_CONFIG_SPEC.filter((spec) => spec.section === 'scorestreaks').map(
      (spec) => spec.key,
    )
    expect(SCORESTREAK_CATALOG.map((streak) => streak.costKey).sort()).toEqual(specKeys.sort())
  })

  it('dentro de cada peso, a ordem do menu é a do custo padrão', () => {
    for (const tier of ['leve', 'media', 'pesada'] as const) {
      const costs = SCORESTREAK_CATALOG.filter((streak) => streak.tier === tier).map((streak) =>
        scorestreakCost(streak.slug, config.scorestreaks),
      )
      expect(costs).toEqual([...costs].sort((a, b) => a - b))
    }
  })

  it('o custo vem do config, pela chave da série', () => {
    expect(scorestreakCost('ping', config.scorestreaks)).toBe(config.scorestreaks.pingCost)
  })

  it('findScorestreak devolve undefined para texto que não é slug', () => {
    expect(findScorestreak('sonar')?.label).toBe('SONAR')
    expect(findScorestreak('uav')).toBeUndefined()
  })

  it('scorestreakBySlug recusa slug fora do catálogo dizendo qual veio', () => {
    expect(() => scorestreakBySlug('uav' as ScorestreakSlug)).toThrow(/uav/)
  })
})
