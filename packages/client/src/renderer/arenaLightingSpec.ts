/**
 * A luz dinâmica da arena, como dado. A ADR 0010 põe a luz do cenário no
 * lightmap do blender; o que cabe aqui é o que o bake não alcança — o
 * **personagem**, que se move — e o greybox, que ainda não tem bake. Uma
 * **chave** direcional que é o sol, e um **preenchimento** hemisférico que é o
 * céu por cima e o rebote do concreto por baixo.
 *
 * Duas luzes e não uma: só com a hemisférica toda parede vertical recebe a
 * mesma quantidade de luz, e caixa com todas as faces iguais é caixa sem volume.
 *
 * Não importa nada da engine de propósito: `arenaLighting.ts` traduz isto para
 * o babylon, e o teste vigia os números sem precisar de cena.
 */
import { daySkySpec, type Rgb, sunTravelDirection } from '../arena/daySky.ts'

export type { Rgb }

export interface KeyLightSpec {
  /** Para onde a luz vai, unitário. É o sol de `daySky.ts`, nunca um vetor próprio. */
  readonly directionM: readonly [number, number, number]
  readonly intensity: number
  readonly colorRgb: Rgb
}

export interface FillLightSpec {
  readonly intensity: number
  /** Cor que vem de cima. */
  readonly skyRgb: Rgb
  /** Cor que vem de baixo: é o que dá silhueta à face inferior das passarelas. */
  readonly groundRgb: Rgb
}

export interface ArenaLightingSpec {
  readonly key: KeyLightSpec
  readonly fill: FillLightSpec
  /**
   * A cor do primeiro quadro, antes de a cúpula de `arenaSky.ts` ser
   * desenhada — por isso é o horizonte e não outra.
   */
  readonly skyClearRgb: Rgb
}

/**
 * A faixa em que a soma das duas luzes tem que cair. O **teto** é onde a face
 * virada para o sol estoura em branco; o **piso** é onde a face na sombra
 * volta a ler como preto numa sala acesa, que é o defeito que derrubou as
 * direções anteriores (ADR 0009, ADR 0010).
 */
export const LIGHT_TOTAL_INTENSITY_MAX = 2.2
export const LIGHT_TOTAL_INTENSITY_MIN = 1.4

/**
 * ```ts
 * lightArena(scene, arenaLightingSpec())
 * ```
 */
export function arenaLightingSpec(): ArenaLightingSpec {
  const sky = daySkySpec()
  return {
    // o sol da hora azul é mais fraco: quem fica de frente para o poente pega
    // laranja, e o resto do corpo vive do céu (ADR 0013).
    key: { directionM: sunTravelDirection(sky), intensity: 0.85, colorRgb: sky.sunRgb },
    fill: {
      intensity: 0.75,
      skyRgb: [0.5, 0.56, 1],
      // quente de baixo: o neon dos letreiros e o asfalto devolvendo o poente.
      // A temperatura oposta à do céu é o que separa a face de cima da de baixo.
      groundRgb: [0.78, 0.38, 0.6],
    },
    skyClearRgb: sky.horizonRgb,
  }
}
