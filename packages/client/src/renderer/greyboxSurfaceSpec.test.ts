import { describe, expect, it } from 'vitest'
import { GREYBOX_BLOCKOUT } from '../arena/greyboxBlockout.ts'
import { paintGreyboxGrid } from '../arena/greyboxGrid.ts'
import {
  greyboxSurfaceSpec,
  SURFACE_LUMINANCE_MAX,
  SURFACE_LUMINANCE_MIN,
  surfaceLuminance,
} from './greyboxSurfaceSpec.ts'

const spec = greyboxSurfaceSpec()
const surfaces = Object.values(spec)

describe('greyboxSurfaceSpec', () => {
  /**
   * Camada sem superfície é bloco sem material, e o babylon desenha isso como
   * branco liso — o que ninguém percebe até estar na arena.
   */
  it('cobre toda camada de caixa que o blockout usa', () => {
    for (const layer of new Set(GREYBOX_BLOCKOUT.map((block) => block.layer))) {
      if (layer === 'prop') continue
      expect(spec[layer], `camada ${layer} sem superfície`).toBeDefined()
    }
  })

  /**
   * Prop não é caixa desenhada: ele traz a própria malha e a própria textura no
   * kit. Dar superfície a ele aqui seria pintar textura que ninguém usa.
   */
  it('não dá superfície de caixa ao prop', () => {
    expect(Object.keys(spec)).not.toContain('prop')
  })

  it('pede ladrilho de tamanho positivo', () => {
    for (const { metresPerTile } of surfaces) {
      expect(metresPerTile).toBeGreaterThan(0)
    }
  })
})

/**
 * A faixa é a direção de arte virada regra (ADR 0010): uma rua de dia, em que
 * a face na sombra ainda lê numa sala acesa e o concreto ao sol não encosta no
 * branco do céu.
 */
describe('a arena vive na banda de uma rua de dia', () => {
  it('toda superfície fica dentro da faixa de luminância', () => {
    for (const grid of surfaces) {
      const value = surfaceLuminance(grid)
      expect(value, `base [${grid.baseRgb.join(', ')}]`).toBeGreaterThanOrEqual(
        SURFACE_LUMINANCE_MIN,
      )
      expect(value, `base [${grid.baseRgb.join(', ')}]`).toBeLessThanOrEqual(SURFACE_LUMINANCE_MAX)
    }
  })

  it('a linha da grade é mais escura que a base que ela divide', () => {
    for (const { baseRgb, lineRgb } of surfaces) {
      expect(lineRgb.every((channel, index) => channel < (baseRgb[index] ?? 0))).toBe(true)
    }
  })

  /** Camada de cor igual à vizinha é camada sem nome, e o mapa perde o callout. */
  it('dá cor distinta a cada camada', () => {
    const colours = surfaces.map(({ baseRgb }) => baseRgb.join())
    expect(new Set(colours).size).toBe(colours.length)
  })
})

describe('toda superfície declarada pinta', () => {
  it('sem recusar a espessura da linha', () => {
    for (const grid of surfaces) expect(() => paintGreyboxGrid(grid)).not.toThrow()
  })
})
