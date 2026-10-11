import { describe, expect, it } from 'vitest'
import { GRID_TILE_PX, type GreyboxGrid, paintGreyboxGrid } from './greyboxGrid.ts'

const GRID: GreyboxGrid = {
  baseRgb: [0.5, 0.6, 0.7],
  lineRgb: [0.1, 0.2, 0.3],
  linePx: 2,
  metresPerTile: 1,
}

function texel(pixels: Uint8Array, row: number, column: number): readonly number[] {
  const start = (row * GRID_TILE_PX + column) * 4
  return [...pixels.slice(start, start + 4)]
}

describe('paintGreyboxGrid', () => {
  it('pinta um ladrilho quadrado rgba', () => {
    expect(paintGreyboxGrid(GRID)).toHaveLength(GRID_TILE_PX * GRID_TILE_PX * 4)
  })

  it('pinta a base no miolo do ladrilho', () => {
    expect(texel(paintGreyboxGrid(GRID), 32, 32)).toEqual([128, 153, 179, 255])
  })

  it('pinta a linha nas bordas de baixo e da esquerda', () => {
    const pixels = paintGreyboxGrid(GRID)
    expect(texel(pixels, 0, 40)).toEqual([26, 51, 77, 255])
    expect(texel(pixels, 40, 1)).toEqual([26, 51, 77, 255])
  })

  it('a linha tem a espessura pedida, e não mais', () => {
    expect(texel(paintGreyboxGrid(GRID), 2, 40)).toEqual([128, 153, 179, 255])
  })

  it('satura canal fora de 0 a 1 em vez de dar a volta no byte', () => {
    const pixels = paintGreyboxGrid({ ...GRID, baseRgb: [1.4, -0.2, 0.5] })
    expect(texel(pixels, 32, 32)).toEqual([255, 0, 128, 255])
  })

  it.each([0, 1.5, GRID_TILE_PX])('recusa linePx %s, com o valor recebido', (linePx) => {
    expect(() => paintGreyboxGrid({ ...GRID, linePx })).toThrow(`linePx recebeu ${linePx}`)
  })
})
