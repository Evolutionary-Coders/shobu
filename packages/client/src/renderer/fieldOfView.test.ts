import { describe, expect, it } from 'vitest'
import { verticalFovRad } from './fieldOfView.ts'

describe('verticalFovRad', () => {
  it('devolve o mesmo ângulo quando a tela é quadrada', () => {
    expect(verticalFovRad(90, 1)).toBeCloseTo(Math.PI / 2)
  })

  it('estreita o fov vertical em tela larga', () => {
    expect(verticalFovRad(103, 16 / 9)).toBeLessThan(verticalFovRad(103, 1))
  })

  it('cresce com o fov horizontal, na mesma proporção de tela', () => {
    expect(verticalFovRad(120, 16 / 9)).toBeGreaterThan(verticalFovRad(90, 16 / 9))
  })

  it.each([0, 180, -10])('rejeita fov horizontal fora de (0, 180): %p', (fov) => {
    expect(() => verticalFovRad(fov, 16 / 9)).toThrow(/horizontalFovDeg/)
  })

  it('rejeita proporção de tela não positiva citando o valor', () => {
    expect(() => verticalFovRad(103, 0)).toThrow(/aspectRatio recebeu 0/)
  })
})
