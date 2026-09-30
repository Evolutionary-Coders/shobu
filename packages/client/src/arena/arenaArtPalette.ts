/**
 * A paleta da arte da arena (ADR 0010), em rgb de tela (espaço gama, 0 a 1).
 * Mora aqui, e não no script do blender, porque é aqui que ela pode ser
 * **testada contra o competidor**: a regra de legibilidade que sobreviveu da
 * ADR 0009 diz que os acentos do jogador (vermelho, âmbar, ciano) não aparecem
 * saturados no cenário, e o corpo escuro dele recorta contra tudo.
 *
 * Desde o adendo da ADR 0010 a regra é a mesma com as cores trocadas: os
 * acentos são ciano, lima e violeta, e o cenário é quem fica com o vermelho e
 * o dourado de chinatown.
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
  | 'fachada-branca'
  | 'fachada-bege'
  | 'fachada-cinza'
  | 'fachada-azul'
  | 'esquadria'
  | 'vidro-claro'
  | 'tijolo-vermelho'
  | 'tijolo-creme'
  | 'escada-verde'
  | 'jade'
  | 'placa-vermelha'
  | 'placa-dourada'
  | 'lanterna-vermelha'
  | 'lanterna-dourada'
  | 'lanterna-rosa'
  | 'lanterna-laranja'

/** As cores de neon: emissivas, sem lightmap, e fonte de luz no bake. */
export type ArtNeon = 'magenta' | 'vermelho' | 'dourado' | 'jade' | 'branco' | 'azul'

export interface ArenaArtPalette {
  readonly surfaces: Readonly<Record<ArtSurface, Rgb>>
  readonly neon: Readonly<Record<ArtNeon, Rgb>>
}

const SURFACES: Readonly<Record<ArtSurface, Rgb>> = {
  // clareou de 0,3 quando a textura de detalhe entrou e o chão virou poço.
  asfalto: [0.37, 0.38, 0.41],
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
  // as fachadas do bairro de fora (ADR 0011): tóquio moderna é reboco claro,
  // pastilha e concreto pré-moldado, não tijolo nem ferrugem.
  'fachada-branca': [0.86, 0.85, 0.82],
  'fachada-bege': [0.78, 0.72, 0.62],
  'fachada-cinza': [0.62, 0.63, 0.65],
  'fachada-azul': [0.56, 0.63, 0.72],
  esquadria: [0.26, 0.27, 0.3],
  // vidro que reflete o céu: mais claro que o vidro de vitrine, porque a
  // janela alta de dia pega o azul de cima e não o escuro de dentro.
  'vidro-claro': [0.4, 0.5, 0.6],
  // chinatown (adendo da ADR 0010): o vermelho e o dourado são do cenário
  // desde que os acentos do competidor viraram ciano, lima e violeta.
  'tijolo-vermelho': [0.62, 0.32, 0.25],
  'tijolo-creme': [0.84, 0.76, 0.62],
  // o verde da escada de incêndio de ferro pintado de nova york e de hong kong.
  'escada-verde': [0.22, 0.46, 0.35],
  jade: [0.2, 0.52, 0.34],
  'placa-vermelha': [0.74, 0.13, 0.1],
  'placa-dourada': [0.9, 0.68, 0.22],
  'lanterna-vermelha': [0.88, 0.2, 0.14],
  'lanterna-dourada': [0.96, 0.76, 0.24],
  'lanterna-rosa': [0.94, 0.46, 0.64],
  'lanterna-laranja': [0.96, 0.52, 0.18],
}

const NEON: Readonly<Record<ArtNeon, Rgb>> = {
  magenta: [1, 0.3, 0.8],
  vermelho: [1, 0.22, 0.16],
  dourado: [1, 0.8, 0.28],
  jade: [0.24, 0.92, 0.46],
  branco: [1, 1, 1],
  azul: [0.35, 0.5, 1],
}

/**
 * ```ts
 * arenaArtPalette().surfaces.asfalto // [0.37, 0.38, 0.41]
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
