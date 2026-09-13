import { describe, expect, it } from 'vitest'
import {
  accentForIndex,
  COMPETITOR_ACCENT_RGB,
  COMPETITOR_BODY_RGB,
  type CompetitorAccent,
} from './competitorPalette.ts'

const ACCENTS = Object.keys(COMPETITOR_ACCENT_RGB) as readonly CompetitorAccent[]

describe('accentForIndex', () => {
  it('gira entre os acentos, sem repetir vizinho', () => {
    const cycle = [0, 1, 2].map(accentForIndex)
    expect(new Set(cycle).size).toBe(3)
  })

  it('volta ao começo depois de dar a volta', () => {
    expect(accentForIndex(3)).toBe(accentForIndex(0))
    expect(accentForIndex(7)).toBe(accentForIndex(1))
  })

  it('recusa índice que não é posição de lista', () => {
    expect(() => accentForIndex(-1)).toThrow(/index recebeu -1/)
    expect(() => accentForIndex(1.5)).toThrow(/index recebeu 1.5/)
  })
})

describe('a paleta', () => {
  /** Preto absoluto contra o chão escuro apaga a forma toda. */
  it('o corpo é escuro, mas não preto absoluto', () => {
    expect(Math.max(...COMPETITOR_BODY_RGB)).toBeGreaterThan(0)
    expect(Math.max(...COMPETITOR_BODY_RGB)).toBeLessThan(0.12)
  })

  /** O que se enxerga de longe são os pontos acesos, não o corpo. */
  it('todo acento é muito mais claro que o corpo', () => {
    for (const accent of ACCENTS) {
      const channels = COMPETITOR_ACCENT_RGB[accent]
      expect(Math.max(...channels)).toBeGreaterThan(Math.max(...COMPETITOR_BODY_RGB) * 8)
    }
  })

  it('os acentos são cores distintas entre si', () => {
    const fingerprints = ACCENTS.map((accent) => COMPETITOR_ACCENT_RGB[accent].join(','))
    expect(new Set(fingerprints).size).toBe(ACCENTS.length)
  })

  it('todo canal fica na faixa que o babylon aceita', () => {
    const every = [COMPETITOR_BODY_RGB, ...ACCENTS.map((a) => COMPETITOR_ACCENT_RGB[a])]
    for (const channels of every) {
      for (const channel of channels) {
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(1)
      }
    }
  })
})
