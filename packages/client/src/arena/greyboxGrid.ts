/**
 * A superfície do greybox, pintada em código: **cor chapada com uma grade de
 * linha fina**, como o greybox de um mapa do valorant antes da arte (ADR 0010).
 *
 * A grade não é enfeite: com ladrilho medido em metros (`greyboxFaceUv.ts`),
 * cada célula é um metro no mundo, e é ela que deixa o jogador — e quem desenha
 * o mapa — ler distância e altura antes de existir qualquer referência de
 * escala. Quando o glb do blender chega, este greybox vira só o fallback.
 *
 * Não importa nada da engine de propósito: `greyboxMaterials.ts` sobe estes
 * bytes para uma textura, e o teste vigia as cores sem precisar de cena.
 */
import type { Rgb } from './daySky.ts'

export type { Rgb }

/** O lado da textura, em texels. Uma célula de grade por ladrilho. */
export const GRID_TILE_PX = 64

export interface GreyboxGrid {
  /** A cor da superfície. É a que conta para legibilidade. */
  readonly baseRgb: Rgb
  /** A linha da grade. Mais escura que a base, e só um pouco. */
  readonly lineRgb: Rgb
  /** Espessura da linha em texels, nas bordas do ladrilho. */
  readonly linePx: number
  /** Quantos metros de mundo um ladrilho cobre. */
  readonly metresPerTile: number
}

/**
 * O ladrilho como pixels rgba: base chapada e a linha nas bordas esquerda e de
 * baixo — ladrilhado, as duas bordas fecham a grade inteira.
 *
 * ```ts
 * paintGreyboxGrid({ baseRgb: [0.5, 0.5, 0.5], lineRgb: [0.4, 0.4, 0.4], linePx: 2, metresPerTile: 1 })
 * ```
 */
export function paintGreyboxGrid(grid: GreyboxGrid): Uint8Array<ArrayBuffer> {
  assertLinePx(grid.linePx)
  const pixels = new Uint8Array(GRID_TILE_PX * GRID_TILE_PX * 4)
  for (let row = 0; row < GRID_TILE_PX; row += 1) {
    for (let column = 0; column < GRID_TILE_PX; column += 1) {
      const onLine = row < grid.linePx || column < grid.linePx
      const colour = onLine ? grid.lineRgb : grid.baseRgb
      pixels.set([...colour.map(toByte), 255], (row * GRID_TILE_PX + column) * 4)
    }
  }
  return pixels
}

function assertLinePx(linePx: number): void {
  if (Number.isInteger(linePx) && linePx >= 1 && linePx < GRID_TILE_PX) return
  throw new RangeError(`linePx recebeu ${linePx}; esperado inteiro entre 1 e ${GRID_TILE_PX - 1}`)
}

function toByte(channel: number): number {
  return Math.round(Math.min(Math.max(channel, 0), 1) * 255)
}
