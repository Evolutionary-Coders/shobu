import { describe, expect, it } from 'vitest'
import {
  greyboxSurfaceSpec,
  SURFACE_LUMINANCE_MIN,
  surfaceLuminance,
} from '../renderer/greyboxSurfaceSpec.ts'
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

function luminance([red, green, blue]: readonly [number, number, number]): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

describe('a paleta', () => {
  /**
   * **O corpo é mais escuro que toda superfície da arena**, e é este teste que
   * amarra as duas pontas da ADR 0010: a rua de dia é clara justamente para o
   * competidor virar recorte contra ela, com folga de quatro vezes. Clarear o
   * corpo, ou escurecer a arena, desfaz o recorte — e reprova aqui.
   */
  it('o corpo é quatro vezes mais escuro que qualquer superfície da arena', () => {
    const corpo = luminance(COMPETITOR_BODY_RGB)
    expect(corpo).toBeLessThan(SURFACE_LUMINANCE_MIN)
    for (const grid of Object.values(greyboxSurfaceSpec())) {
      expect(corpo, `corpo contra base [${grid.baseRgb.join(', ')}]`).toBeLessThan(
        surfaceLuminance(grid) / 4,
      )
    }
  })

  /**
   * Preto chapado engole o volume: sem meio-tom nenhum, ombro, peito e coxa
   * viram uma mancha só e o boneco perde forma de perto.
   */
  it('o corpo não é preto chapado', () => {
    expect(Math.max(...COMPETITOR_BODY_RGB)).toBeGreaterThan(0.03)
  })

  /** O que se enxerga de longe são os pontos acesos, não o corpo. */
  it('todo acento é muito mais claro que o corpo', () => {
    for (const accent of ACCENTS) {
      const channels = COMPETITOR_ACCENT_RGB[accent]
      expect(Math.max(...channels)).toBeGreaterThan(Math.max(...COMPETITOR_BODY_RGB) * 3)
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
