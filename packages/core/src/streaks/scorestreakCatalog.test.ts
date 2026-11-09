import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { config } from '../bots/botTestKit.ts'
import { GAMEPLAY_CONFIG_SPEC } from '../config/gameplayConfigSpec.ts'
import {
  AVAILABLE_SCORESTREAKS,
  findScorestreak,
  isScorestreakAvailable,
  SCORESTREAK_CATALOG,
  type ScorestreakSlug,
  scorestreakBySlug,
  scorestreakCost,
} from './scorestreakCatalog.ts'

/**
 * O ícone mora em `public/` e é achado pelo slug: se um slug muda ou uma série
 * entra sem rodar `npm run build:scorestreak-icons`, o menu mostra um quadrado
 * vazio sem erro nenhum. A tranca é aqui, como a das medalhas.
 */
const ICON_DIR = new URL(
  '../../../../packages/client/public/assets/images/scorestreaks/',
  import.meta.url,
)

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

  it('as cinco sem efeito previsto para a feira ficam bloqueadas, e só elas', () => {
    const blocked = SCORESTREAK_CATALOG.filter((streak) => !streak.available)
    expect(blocked.map((streak) => streak.label)).toEqual([
      'HOLOGRAMA ISCA',
      'CAMUFLAGEM ÓPTICA',
      'GOLPE ORBITAL',
      'DRONE KAMIKAZE',
      'CAÇADOR NEON',
    ])
    expect(AVAILABLE_SCORESTREAKS).toHaveLength(SCORESTREAK_CATALOG.length - blocked.length)
  })

  it('isScorestreakAvailable: a disponível sim, a bloqueada e a desconhecida não', () => {
    expect(isScorestreakAvailable('sonar')).toBe(true)
    expect(isScorestreakAvailable('orbital-strike')).toBe(false)
    expect(isScorestreakAvailable('uav')).toBe(false)
  })

  it('scorestreakBySlug recusa slug fora do catálogo dizendo qual veio', () => {
    expect(() => scorestreakBySlug('uav' as ScorestreakSlug)).toThrow(/uav/)
  })

  it.each(SCORESTREAK_CATALOG)('$slug tem miniatura em public/', ({ slug }) => {
    expect(existsSync(new URL(`${slug}.svg`, ICON_DIR))).toBe(true)
  })
})
