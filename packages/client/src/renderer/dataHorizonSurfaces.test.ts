import { describe, expect, it } from 'vitest'
import { paintCircuit, paintPanel, SURFACE_SIZE_PX } from '../arena/cyberspaceSurface.ts'
import { GRID_MAJOR_EVERY } from '../arena/dataHorizon.ts'
import { gridSurface, towerSurface } from './dataHorizonSurfaces.ts'
import { greyboxSurfaceSpec } from './greyboxSurfaceSpec.ts'

const outside = [gridSurface(), towerSurface()]

function luminance([red, green, blue]: readonly [number, number, number]): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

const darkestInside = Math.min(
  ...Object.values(greyboxSurfaceSpec()).map(({ panelRgb }) => luminance(panelRgb)),
)

/**
 * A regra da ADR 0009 que vale do lado de fora: o horizonte não disputa
 * atenção com a arena. Se ele ficar mais claro que o painel mais escuro de
 * dentro, o olho passa a ser puxado para o fundo — que é justamente o defeito
 * que aposentou a cidade cyberpunk.
 */
describe('o lado de fora não compete com a arena', () => {
  it.each(outside.map((surface, at) => [at, surface] as const))(
    'a superfície %i é mais escura que todo painel da arena',
    (_at, surface) => {
      expect(luminance(surface.panelRgb)).toBeLessThan(darkestInside)
    },
  )

  /** Circuito forte lá atrás é ruído na mesma frequência de um alvo distante. */
  it.each(outside.map((surface, at) => [at, surface] as const))(
    'o circuito da superfície %i é fraco',
    (_at, surface) => {
      expect(luminance(surface.circuitRgb)).toBeLessThan(0.45)
      expect(luminance(surface.circuitRgb)).toBeGreaterThan(luminance(surface.panelRgb))
    },
  )

  it.each(outside.map((surface, at) => [at, surface] as const))(
    'a superfície %i é opaca, porque translucidez lá fora só custa ordenação',
    (_at, surface) => {
      expect(surface.panelAlpha).toBe(1)
    },
  )
})

describe('gridSurface', () => {
  /**
   * A célula da textura **é** a célula maior da grade. Se as duas divergirem, a
   * régua do mapa mente — e régua que mente é pior que nenhuma, porque o
   * jogador confia nela para estimar distância de tiro.
   */
  it('divide o ladrilho no mesmo número de células da grade', () => {
    expect(SURFACE_SIZE_PX / gridSurface().cellPx).toBe(GRID_MAJOR_EVERY)
  })

  /** Costura visível na grade desenha uma segunda malha por cima da primeira. */
  it('não tem costura própria: a linha do circuito é a grade', () => {
    const { panelRgb, seamRgb } = gridSurface()
    expect(seamRgb).toEqual(panelRgb)
  })

  it('pinta os dois mapas', () => {
    expect(() => paintPanel(gridSurface())).not.toThrow()
    expect(() => paintCircuit(gridSurface())).not.toThrow()
  })
})

describe('towerSurface', () => {
  it('pinta os dois mapas', () => {
    expect(() => paintPanel(towerSurface())).not.toThrow()
    expect(() => paintCircuit(towerSurface())).not.toThrow()
  })

  /** Célula fina a 300 m vira cintilação, que é ruído na frequência do alvo. */
  it('tem célula grossa, porque é vista de longe', () => {
    expect(towerSurface().cellPx).toBeGreaterThanOrEqual(16)
  })
})
