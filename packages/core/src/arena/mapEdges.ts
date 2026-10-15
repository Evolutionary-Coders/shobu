/**
 * O que todo mapa tem na borda do bairro (ADR 0011): o piso inteiro, a parede
 * invisível no fim dele e o bloqueio de obra em cada rua que chega lá. Saiu do
 * `ichibanGai.ts` quando o segundo mapa precisou das mesmas peças.
 */
import {
  type ArenaZone,
  blockBetween,
  COVER_HEIGHT_M,
  type GreyboxBlock,
  type Vec3,
} from './arenaBlock.ts'

export interface StreetMouth {
  readonly name: string
  /** O eixo da borda: `z` é a borda norte ou sul, `x` a leste ou oeste. */
  readonly axis: 'x' | 'z'
  readonly edgeM: number
  /** Para que lado fica o mapa, a partir da borda. */
  readonly inward: 1 | -1
  /** O trecho aberto da borda, no outro eixo horizontal. */
  readonly span: readonly [number, number]
  /** O callout da rua que a boca fecha. */
  readonly zone?: ArenaZone
}

/**
 * O fim do mapa como o CS e o Valorant fazem: a rua não bate numa parede
 * invisível, ela é fechada por obra. Tapume alto o bastante para ninguém
 * passar nem de cima da barreira (4,2 m contra 1,1 + 2,68 de pulo duplo),
 * barreira de concreto na frente e caixotes nas pontas. Tudo com colisão: o
 * que o jogador vê bloquear é o que bloqueia.
 *
 * ```ts
 * mapEdgeBlockades([{ name: 'fim-avenida', axis: 'z', edgeM: 62, inward: -1, span: [-9, 9] }])
 * ```
 */
export function mapEdgeBlockades(mouths: readonly StreetMouth[]): readonly GreyboxBlock[] {
  return mouths.flatMap(blockade)
}

const HOARDING_HEIGHT_M = 4.2
const JERSEY_HEIGHT_M = 1.1
const JERSEY_LENGTH_M = 2
const JERSEY_GAP_M = 0.5

function blockade(mouth: StreetMouth): readonly GreyboxBlock[] {
  const [from, to] = mouth.span
  const pieces = [
    mouthBlock(mouth, 'tapume', 'blockade', [from, to], [0.4, 0.8], HOARDING_HEIGHT_M),
    ...jerseys(mouth),
  ]
  if (to - from >= 8) {
    pieces.push(
      mouthBlock(
        mouth,
        'caixotes-1',
        'cover',
        [from + 0.2, from + 1.7],
        [1.2, 2.7],
        COVER_HEIGHT_M,
      ),
    )
    pieces.push(
      mouthBlock(mouth, 'caixotes-2', 'cover', [to - 1.7, to - 0.2], [1.2, 2.7], COVER_HEIGHT_M),
    )
  }
  return pieces
}

/** As barreiras de concreto em fila, com vão entre elas, a um metro e meio do tapume. */
function jerseys(mouth: StreetMouth): readonly GreyboxBlock[] {
  const [from, to] = mouth.span
  const count = Math.floor((to - from - 3.4 + JERSEY_GAP_M) / (JERSEY_LENGTH_M + JERSEY_GAP_M))
  const start = (from + to - count * JERSEY_LENGTH_M - (count - 1) * JERSEY_GAP_M) / 2
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const low = start + index * (JERSEY_LENGTH_M + JERSEY_GAP_M)
    const along: readonly [number, number] = [low, low + JERSEY_LENGTH_M]
    return mouthBlock(
      mouth,
      `barreira-${index + 1}`,
      'lowCover',
      along,
      [3.0, 3.8],
      JERSEY_HEIGHT_M,
    )
  })
}

/** Um bloco da boca de rua, entre `depthM` metros da borda para dentro, no trecho `along`. */
function mouthBlock(
  mouth: StreetMouth,
  part: string,
  layer: GreyboxBlock['layer'],
  along: readonly [number, number],
  depthM: readonly [number, number],
  heightM: number,
): GreyboxBlock {
  const near = mouth.edgeM + mouth.inward * depthM[0]
  const far = mouth.edgeM + mouth.inward * depthM[1]
  const low: Vec3 = mouth.axis === 'z' ? [along[0], 0, near] : [near, 0, along[0]]
  const high: Vec3 = mouth.axis === 'z' ? [along[1], heightM, far] : [far, heightM, along[1]]
  return blockBetween(`${mouth.name}-${part}`, layer, mouth.zone ?? 'rua', low, high)
}

/**
 * O que não tem gêmeo: o piso do bairro e a parede invisível do fim dele, que
 * já são simétricos sozinhos. A parede é colisão pura — ninguém a vê, porque
 * ninguém chega nela dentro do prazo fora da área (ADR 0011).
 *
 * ```ts
 * worldShell(56, 62, 40) // piso de 112 × 124 m e as quatro paredes
 * ```
 */
export function worldShell(x: number, z: number, h: number): readonly GreyboxBlock[] {
  return [
    blockBetween('piso', 'floor', 'rua', [-x, -1, -z], [x, 0, z]),
    blockBetween('limite-norte', 'barrier', 'rua', [-x - 1, 0, z], [x + 1, h, z + 1]),
    blockBetween('limite-sul', 'barrier', 'rua', [-x - 1, 0, -z - 1], [x + 1, h, -z]),
    blockBetween('limite-leste', 'barrier', 'rua', [x, 0, -z], [x + 1, h, z]),
    blockBetween('limite-oeste', 'barrier', 'rua', [-x - 1, 0, -z], [-x, h, z]),
  ]
}
