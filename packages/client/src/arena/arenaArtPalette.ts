/**
 * A paleta da arte da arena (ADR 0010), em rgb de tela (espaço gama, 0 a 1).
 * Mora aqui, e não no script do blender, porque é aqui que ela pode ser
 * **testada contra o competidor**: a regra de legibilidade que sobreviveu da
 * ADR 0009 diz que os acentos do jogador (vermelho, âmbar, ciano) não aparecem
 * saturados no cenário, e o corpo escuro dele recorta contra tudo.
 *
 * O blender recebe estes números pelo json de `scripts/export-arena-layout.mjs`
 * e converte para linear antes do bake. O cliente não os lê: a cor chega no
 * glb, já no material.
 */
import type { Rgb } from './daySky.ts'

export type { Rgb }

/** As superfícies difusas, que recebem lightmap. */
export type ArtSurface =
  | 'asfalto'
  | 'calcada'
  | 'faixa'
  | 'concreto'
  | 'telhado'
  | 'fachada'
  | 'mercado-parede'
  | 'mercado-madeira'
  | 'toldo'
  | 'pachinko-parede'
  | 'pachinko-friso'
  | 'aco'
  | 'vidro'
  | 'conteiner'
  | 'caminhao'

/** As cores de neon: emissivas, sem lightmap, e fonte de luz no bake. */
export type ArtNeon = 'magenta' | 'violeta' | 'lima' | 'branco' | 'azul'

export interface ArenaArtPalette {
  readonly surfaces: Readonly<Record<ArtSurface, Rgb>>
  readonly neon: Readonly<Record<ArtNeon, Rgb>>
}

const SURFACES: Readonly<Record<ArtSurface, Rgb>> = {
  asfalto: [0.3, 0.31, 0.34],
  calcada: [0.62, 0.6, 0.56],
  faixa: [0.9, 0.9, 0.88],
  concreto: [0.7, 0.68, 0.64],
  // manta de telhado, mais escura que a parede: de cima, o telhado é o fundo do
  // alvo que atravessa a camada do topo, e parede clara ali some o recorte.
  telhado: [0.44, 0.45, 0.48],
  fachada: [0.6, 0.63, 0.68],
  // terracota apagada, não tijolo vermelho: vermelho saturado é o acento
  // de um dos competidores.
  'mercado-parede': [0.66, 0.52, 0.42],
  'mercado-madeira': [0.5, 0.37, 0.27],
  toldo: [0.3, 0.5, 0.4],
  'pachinko-parede': [0.84, 0.62, 0.76],
  'pachinko-friso': [0.45, 0.36, 0.62],
  aco: [0.5, 0.56, 0.6],
  vidro: [0.2, 0.24, 0.3],
  conteiner: [0.3, 0.42, 0.64],
  caminhao: [0.82, 0.82, 0.8],
}

const NEON: Readonly<Record<ArtNeon, Rgb>> = {
  magenta: [1, 0.3, 0.8],
  violeta: [0.62, 0.42, 1],
  lima: [0.62, 1, 0.3],
  branco: [1, 1, 1],
  azul: [0.35, 0.5, 1],
}

/**
 * ```ts
 * arenaArtPalette().surfaces.asfalto // [0.3, 0.31, 0.34]
 * ```
 */
export function arenaArtPalette(): ArenaArtPalette {
  return { surfaces: SURFACES, neon: NEON }
}

/** Matiz em graus (0 a 360) e saturação (0 a 1) no modelo hsv. */
export function hueAndSaturation([r, g, b]: Rgb): { hueDeg: number; saturation: number } {
  const max = Math.max(r, g, b)
  const chroma = max - Math.min(r, g, b)
  const saturation = max === 0 ? 0 : chroma / max
  if (chroma === 0) return { hueDeg: 0, saturation }
  return { hueDeg: hueOf(r, g, b, max, chroma), saturation }
}

function hueOf(r: number, g: number, b: number, max: number, chroma: number): number {
  if (max === r) return (60 * ((g - b) / chroma) + 360) % 360
  if (max === g) return 60 * ((b - r) / chroma + 2)
  return 60 * ((r - g) / chroma + 4)
}

/** A distância entre dois matizes, pelo lado mais curto do círculo. */
export function hueDistanceDeg(first: number, second: number): number {
  const raw = Math.abs(first - second) % 360
  return Math.min(raw, 360 - raw)
}
