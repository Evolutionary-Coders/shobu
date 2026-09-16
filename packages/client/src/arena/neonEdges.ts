/**
 * As fitas de neon que contornam o topo de cada plataforma da arena, em
 * **metros** (ADR 0005).
 *
 * **Não é enfeite, é level design.** A borda da plataforma é exatamente o que
 * quem se move precisa ler para decidir se o pulo cabe, e até aqui ela só
 * existia por silhueta — contra um fundo escuro, silhueta é o primeiro canal a
 * sumir. A fita acende aquela linha por conta própria, sem depender de nenhuma
 * luz da cena.
 *
 * É também o que dá cor à arena **sem sujá-la**: a cor da camada passa a vir
 * de luz, não de textura suja e tom quente. Ferrugem para separar deck de piso
 * é vocabulário de ferro-velho; linha de neon é vocabulário de ciberespaço.
 *
 * Custo de luz: **zero**. São malhas com emissiva e `disableLighting`, fundidas
 * por cor num draw call cada — ver `arenaNeon.ts`.
 *
 * Não importa nada da engine de propósito, como o resto de `arena/`.
 */
import type { ArenaLayer, GreyboxBlock } from './greyboxBlockout.ts'

export type Rgb = readonly [number, number, number]

/** As camadas que ganham contorno. `shell` não: quem contorna o piso é a barreira. */
export type NeonEdgeLayer = Extract<ArenaLayer, 'ground' | 'mid' | 'top'>

export interface NeonStrip {
  readonly name: string
  readonly centerM: readonly [number, number, number]
  readonly sizeM: readonly [number, number, number]
  readonly colourRgb: Rgb
}

/** Largura da fita, medida para dentro da borda do bloco. */
export const NEON_STRIP_WIDTH_M = 0.12

/** Altura da fita. Dez vezes abaixo do `stepHeightM`: não é degrau nem obstáculo. */
export const NEON_STRIP_HEIGHT_M = 0.04

/**
 * O quanto a fita sobra acima da face de cima do bloco. Existe só para o
 * z-fighting não aparecer, e é pequena o bastante para não mentir sobre onde o
 * piso está — a caixa de colisão do bloco continua sendo a verdade.
 */
export const NEON_STRIP_PROUD_M = 0.005

/**
 * Uma cor por camada. É o **terceiro** canal da verticalidade, depois da
 * altura e da superfície: o jogador passa a ter nome para posição — "o deck
 * magenta", "a passarela âmbar" —, que é como time de fps fala de mapa.
 *
 * Âmbar no topo não é escolha solta: é a cor da identidade de ui do art bible,
 * e a camada de cima é a que mais aparece recortada contra o céu.
 */
export const NEON_EDGE_RGB: Readonly<Record<NeonEdgeLayer, Rgb>> = {
  ground: [0.1, 0.9, 1],
  mid: [1, 0.15, 0.7],
  top: [1, 0.66, 0.1],
}

/**
 * As fitas de todo bloco que tem contorno, prontas para virar malha.
 *
 * ```ts
 * neonEdgeStrips(GREYBOX_BLOCKOUT)[0].colourRgb // [0.1, 0.9, 1]
 * ```
 */
export function neonEdgeStrips(blockout: readonly GreyboxBlock[]): readonly NeonStrip[] {
  if (blockout.length === 0) {
    throw new RangeError('blockout recebeu lista vazia; esperado ao menos um bloco de arena')
  }
  return blockout.filter(hasNeonEdge).flatMap(stripsAroundTop)
}

function hasNeonEdge(
  block: GreyboxBlock,
): block is GreyboxBlock & { readonly layer: NeonEdgeLayer } {
  return block.layer === 'ground' || block.layer === 'mid' || block.layer === 'top'
}

/**
 * Quatro fitas por bloco, uma por lado da face de cima.
 *
 * A face de fora de cada fita fica **rente à face do bloco**, e não recuada:
 * é o contorno da silhueta que interessa, e fita recuada desenha um retângulo
 * dentro da plataforma em vez de acender a beirada dela.
 */
function stripsAroundTop(
  block: GreyboxBlock & { readonly layer: NeonEdgeLayer },
): readonly NeonStrip[] {
  const [width, height, depth] = block.sizeM
  const [x, y, z] = block.centerM
  const top = y + height / 2 + NEON_STRIP_PROUD_M - NEON_STRIP_HEIGHT_M / 2
  const insetX = width / 2 - NEON_STRIP_WIDTH_M / 2
  const insetZ = depth / 2 - NEON_STRIP_WIDTH_M / 2
  const along: readonly [number, number, number] = [width, NEON_STRIP_HEIGHT_M, NEON_STRIP_WIDTH_M]
  const across: readonly [number, number, number] = [NEON_STRIP_WIDTH_M, NEON_STRIP_HEIGHT_M, depth]
  const colourRgb = NEON_EDGE_RGB[block.layer]
  return [
    { name: `${block.name}-neon-north`, centerM: [x, top, z + insetZ], sizeM: along, colourRgb },
    { name: `${block.name}-neon-south`, centerM: [x, top, z - insetZ], sizeM: along, colourRgb },
    { name: `${block.name}-neon-east`, centerM: [x + insetX, top, z], sizeM: across, colourRgb },
    { name: `${block.name}-neon-west`, centerM: [x - insetX, top, z], sizeM: across, colourRgb },
  ]
}
