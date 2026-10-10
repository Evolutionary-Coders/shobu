import { describe, expect, it } from 'vitest'
import { COMPETITOR_ACCENT_RGB, COMPETITOR_BODY_RGB } from '../character/competitorPalette.ts'
import { arenaArtPalette, hueAndSaturation, hueDistanceDeg } from './arenaArtPalette.ts'
import { relativeLuminance } from './daySky.ts'

const palette = arenaArtPalette()
const everyColour = [...Object.entries(palette.surfaces), ...Object.entries(palette.neon)]

/** Abaixo disto a cor é quase cinza, e matiz de quase cinza não disputa com acento nenhum. */
const SATURATED = 0.5
/** Quão longe do matiz de um acento do competidor uma cor saturada do cenário tem que ficar. */
const MIN_ACCENT_DISTANCE_DEG = 25

describe('a paleta da arte e o competidor', () => {
  /**
   * A regra da ADR 0009 que a 0010 manteve: se o cenário usa o vermelho, o
   * âmbar ou o ciano do jogador, o olho procura o alvo e acha um letreiro.
   */
  it('nenhuma cor saturada do cenário fica perto de um acento do competidor', () => {
    const accents = Object.entries(COMPETITOR_ACCENT_RGB).map(
      ([name, rgb]) => [name, hueAndSaturation(rgb).hueDeg] as const,
    )
    for (const [name, rgb] of everyColour) {
      const { hueDeg, saturation } = hueAndSaturation(rgb)
      if (saturation < SATURATED) continue
      for (const [accent, accentHue] of accents) {
        expect(
          hueDistanceDeg(hueDeg, accentHue),
          `${name} (${hueDeg.toFixed(0)}°) perto do acento ${accent}`,
        ).toBeGreaterThanOrEqual(MIN_ACCENT_DISTANCE_DEG)
      }
    }
  })

  it('o corpo do competidor é três vezes mais escuro que qualquer superfície', () => {
    const corpo = relativeLuminance(COMPETITOR_BODY_RGB)
    for (const [name, rgb] of Object.entries(palette.surfaces)) {
      expect(relativeLuminance(rgb), name).toBeGreaterThan(corpo * 3)
    }
  })

  it('toda cor fica entre 0 e 1', () => {
    for (const [name, rgb] of everyColour) {
      expect(
        rgb.every((channel) => channel >= 0 && channel <= 1),
        name,
      ).toBe(true)
    }
  })
})

describe('hueAndSaturation', () => {
  it.each([
    [[1, 0, 0], 0],
    [[0, 1, 0], 120],
    [[0, 0, 1], 240],
    [[1, 0, 1], 300],
    [[1, 0.5, 0], 30],
  ] as const)('%j tem matiz %s°', (rgb, hueDeg) => {
    expect(hueAndSaturation(rgb).hueDeg).toBeCloseTo(hueDeg)
  })

  it('cinza tem saturação zero', () => {
    expect(hueAndSaturation([0.5, 0.5, 0.5])).toEqual({ hueDeg: 0, saturation: 0 })
  })

  it('preto tem saturação zero', () => {
    expect(hueAndSaturation([0, 0, 0]).saturation).toBe(0)
  })
})

describe('hueDistanceDeg', () => {
  it('mede pelo lado curto do círculo', () => {
    expect(hueDistanceDeg(350, 10)).toBe(20)
    expect(hueDistanceDeg(10, 350)).toBe(20)
    expect(hueDistanceDeg(90, 270)).toBe(180)
  })
})
