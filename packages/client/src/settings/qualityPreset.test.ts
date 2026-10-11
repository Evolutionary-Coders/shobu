import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAYER_SETTINGS } from './playerSettingsSpec.ts'
import {
  MAX_DEVICE_PIXEL_RATIO,
  pixelRatioFor,
  QUALITY_LABELS,
  QUALITY_LEVELS,
  QUALITY_PRESETS,
  qualityLevelFor,
  qualityPresetAt,
} from './qualityPreset.ts'

describe('QUALITY_LEVELS', () => {
  it('cada predefinição custa menos que a de cima', () => {
    const { quality, balanced, performance } = QUALITY_LEVELS
    expect(quality.anisotropy).toBeGreaterThan(balanced.anisotropy)
    expect(balanced.anisotropy).toBeGreaterThan(performance.anisotropy)
    expect(performance.renderScale).toBeLessThan(balanced.renderScale)
  })

  it('DESEMPENHO é o modo leve: sem gradação, sombras de contato nem halo', () => {
    const { grading, contactShadows, neonGlow } = QUALITY_LEVELS.performance
    expect([grading, contactShadows, neonGlow]).toEqual([false, false, false])
  })

  it('um rótulo por predefinição, na ordem do menu', () => {
    expect(QUALITY_LABELS).toHaveLength(QUALITY_PRESETS.length)
    expect(QUALITY_PRESETS.at(-1)).toBe('auto')
  })
})

describe('o padrão', () => {
  /** Teste num notebook de gpu integrada (11/10): QUALIDADE a 17 FPS, DESEMPENHO a 60. */
  it('é DESEMPENHO', () => {
    expect(qualityPresetAt(DEFAULT_PLAYER_SETTINGS.quality)).toBe('performance')
  })
})

describe('qualityPresetAt', () => {
  it('lê o índice das configurações', () => {
    expect(qualityPresetAt(0)).toBe('quality')
    expect(qualityPresetAt(2)).toBe('performance')
  })

  it('índice fora da lista cai no AUTO', () => {
    expect(qualityPresetAt(9)).toBe('auto')
  })
})

describe('qualityLevelFor', () => {
  it('as fixas vêm da tabela', () => {
    expect(qualityLevelFor('performance', 0.6)).toBe(QUALITY_LEVELS.performance)
  })

  it('o AUTO é EQUILIBRADO com a escala da política', () => {
    expect(qualityLevelFor('auto', 0.7)).toEqual({ ...QUALITY_LEVELS.balanced, renderScale: 0.7 })
  })
})

describe('pixelRatioFor', () => {
  it('QUALIDADE segue a tela, com teto', () => {
    expect(pixelRatioFor(QUALITY_LEVELS.quality, 1.5)).toBe(1.5)
    expect(pixelRatioFor(QUALITY_LEVELS.quality, 3)).toBe(MAX_DEVICE_PIXEL_RATIO)
    expect(pixelRatioFor(QUALITY_LEVELS.quality, 0.5)).toBe(1)
  })

  it('as outras usam a escala da tabela, qualquer que seja a tela', () => {
    expect(pixelRatioFor(QUALITY_LEVELS.balanced, 3)).toBe(1)
    expect(pixelRatioFor(QUALITY_LEVELS.performance, 2)).toBe(0.75)
  })
})
