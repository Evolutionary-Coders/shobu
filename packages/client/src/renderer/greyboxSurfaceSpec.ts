import type { ArenaLayer } from '../arena/arenaBlock.ts'
import { type Rgb, relativeLuminance } from '../arena/daySky.ts'
import type { GreyboxGrid } from '../arena/greyboxGrid.ts'

/**
 * O que cada camada de caixa do blockout veste enquanto o glb do blender não
 * chega: cor chapada com grade de um metro (ADR 0010). É também o **fallback**
 * permanente — se o download da arte falhar, a arena continua jogável e
 * legível com isto.
 */

/** Toda camada que o `buildGreyboxArena` desenha como caixa. */
export type GreyboxSurfaceLayer = ArenaLayer

/**
 * A faixa de luminância das superfícies. É a banda de uma rua de dia: o
 * **piso** é onde a face na sombra ainda lê numa sala acesa, o **teto** é
 * onde o concreto ao sol encosta no branco do céu e o recorte do alvo no
 * telhado some.
 */
export const SURFACE_LUMINANCE_MIN = 0.3
export const SURFACE_LUMINANCE_MAX = 0.75

/** A linha da grade é a base escurecida: legível de perto, some a 30 m. */
const LINE_SHADE = 0.82

function surface(baseRgb: Rgb, metresPerTile: number): GreyboxGrid {
  return {
    baseRgb,
    lineRgb: [baseRgb[0] * LINE_SHADE, baseRgb[1] * LINE_SHADE, baseRgb[2] * LINE_SHADE],
    linePx: 2,
    metresPerTile,
  }
}

/**
 * ```ts
 * greyboxSurfaceSpec().floor.baseRgb // [0.42, 0.44, 0.48]
 * ```
 */
export function greyboxSurfaceSpec(): Readonly<Record<GreyboxSurfaceLayer, GreyboxGrid>> {
  return {
    // asfalto: o mais escuro do cenário, porque é o que a câmera mais olha.
    floor: surface([0.42, 0.44, 0.48], 2),
    barrier: surface([0.66, 0.62, 0.56], 2),
    building: surface([0.72, 0.66, 0.55], 1),
    // azul ardósia na passarela: é a camada que mais se atravessa, e ela
    // precisa de nome próprio de longe.
    walkway: surface([0.55, 0.62, 0.7], 1),
    stair: surface([0.62, 0.58, 0.66], 1),
    // verde: cobertura é o que se procura com o olho no meio do tiroteio.
    cover: surface([0.5, 0.58, 0.52], 1),
    lowCover: surface([0.46, 0.5, 0.62], 1),
    outskirt: surface([0.62, 0.64, 0.66], 2),
    blockade: surface([0.7, 0.6, 0.42], 1),
    // vermelho de toldo: laje fina que se pisa, e que o olho tem que achar.
    ledge: surface([0.7, 0.45, 0.42], 1),
  }
}

/** A luminância da base, que é a cor que conta para legibilidade. */
export function surfaceLuminance(grid: GreyboxGrid): number {
  return relativeLuminance(grid.baseRgb)
}
