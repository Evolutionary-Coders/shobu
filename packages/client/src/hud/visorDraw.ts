import type { KillIconId } from './killIcons.ts'
import type { VisorColor } from './visorPalette.ts'

/**
 * O vocabulário de desenho do visor do óculos: as operações que o modelo
 * (`headsetVisorModel.ts`) devolve e que o adapter
 * (`headsetVisor.ts`) pinta num canvas. Dado puro: o modelo diz **o que** e
 * **onde**, e só o adapter sabe de `CanvasRenderingContext2D`.
 */
export type VisorFont = 'mono' | 'tech' | 'kanji'
export type VisorAlign = 'left' | 'center' | 'right'

export type VisorOp =
  | {
      readonly kind: 'text'
      readonly x: number
      readonly y: number
      readonly text: string
      readonly size: number
      readonly color: VisorColor
      readonly align: VisorAlign
      readonly font: VisorFont
    }
  | {
      readonly kind: 'chip'
      readonly x: number
      readonly y: number
      readonly size: number
      readonly text: string
    }
  | {
      readonly kind: 'bar'
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
      readonly fraction: number
      readonly color: VisorColor
    }
  | { readonly kind: 'brackets'; readonly inset: number; readonly length: number }
  | {
      readonly kind: 'plate'
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
    }
  | { readonly kind: 'hitmarker'; readonly size: number }
  | {
      /** Um ícone de kill (`killIcons.ts`), com o topo em `y` e escalado para `height`. */
      readonly kind: 'icon'
      readonly id: KillIconId
      readonly x: number
      readonly y: number
      readonly height: number
      readonly color: VisorColor
    }
  | {
      /** Uma imagem quadrada servida de `public/`: o retrato da skin. */
      readonly kind: 'image'
      readonly url: string
      readonly x: number
      readonly y: number
      readonly size: number
    }
  | { readonly kind: 'scope'; readonly radius: number }

/** Um texto: o atalho que deixa cada linha do modelo caber numa linha só. */
export function text(
  x: number,
  y: number,
  value: string,
  size: number,
  color: VisorColor,
  align: VisorAlign,
  font: VisorFont,
): VisorOp {
  return { kind: 'text', x, y, text: value, size, color, align, font }
}

/** Uma barra fina, com a fração recortada entre 0 e 1. */
export function bar(
  x: number,
  y: number,
  width: number,
  height: number,
  fraction: number,
  color: VisorColor,
): VisorOp {
  return { kind: 'bar', x, y, width, height, fraction: Math.max(0, Math.min(1, fraction)), color }
}
