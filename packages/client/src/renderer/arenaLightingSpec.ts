/**
 * A luz da arena, como dado. A ADR 0004 fecha a porta para pbr e sombra
 * dinâmica — a luz de verdade virá cozida no lightmap do glTF —, então o que
 * cabe aqui é o mínimo que faz um greybox ler: uma **chave** direcional para
 * cada face ter um tom, e um **preenchimento** hemisférico para face nenhuma
 * ficar preta.
 *
 * Duas luzes e não uma: só com a hemisférica toda parede vertical recebe a
 * mesma quantidade de luz, e caixa com todas as faces iguais é caixa sem
 * volume. Foi assim que a arena estava escura e chapada.
 *
 * Não importa nada da engine de propósito: `arenaLighting.ts` traduz isto para
 * o babylon, e o teste vigia os números sem precisar de cena.
 */

export type Rgb = readonly [number, number, number]

export interface KeyLightSpec {
  /** Para onde a luz vai. Aponta para baixo: é um sol, não um refletor de chão. */
  readonly directionM: readonly [number, number, number]
  readonly intensity: number
  readonly colorRgb: Rgb
}

export interface FillLightSpec {
  readonly intensity: number
  /** Cor que vem de cima. */
  readonly skyRgb: Rgb
  /** Cor que vem de baixo: é o que dá silhueta à face inferior das plataformas. */
  readonly groundRgb: Rgb
}

export interface ArenaLightingSpec {
  readonly key: KeyLightSpec
  readonly fill: FillLightSpec
  /** O céu por cima do casco. Escuro, mas tingido — preto puro não pertence à paleta. */
  readonly skyClearRgb: Rgb
}

/**
 * A soma das intensidades passa de 1 de propósito: o material do greybox tem
 * difusa entre 0,3 e 0,8 e nenhuma especular, então abaixo disso tudo fica no
 * terço inferior da faixa. O teto de 2,2 é onde a face virada para a chave
 * começa a estourar em branco.
 */
export const LIGHT_TOTAL_INTENSITY_MAX = 2.2

/**
 * ```ts
 * const spec = arenaLightingSpec()
 * spec.key.directionM // [-0.45, -1, -0.35]
 * ```
 */
export function arenaLightingSpec(): ArenaLightingSpec {
  return {
    key: {
      // vem do alto, de nordeste: os decks e as passarelas ficam iluminados
      // de um lado e sombreados do outro, e a verticalidade lê de qualquer spawn.
      directionM: [-0.45, -1, -0.35],
      intensity: 1.25,
      // levemente quente, contra o preenchimento frio: é o contraste de
      // temperatura que separa face de cima de face de lado, não a intensidade.
      colorRgb: [1, 0.94, 0.86],
    },
    fill: {
      intensity: 0.85,
      skyRgb: [0.74, 0.8, 1],
      groundRgb: [0.46, 0.4, 0.5],
    },
    skyClearRgb: [0.06, 0.05, 0.1],
  }
}

/**
 * Direção da chave normalizada, para o babylon não receber um vetor de
 * comprimento arbitrário e mudar a intensidade sem ninguém pedir.
 *
 * ```ts
 * keyLightDirection(arenaLightingSpec()) // [-0.39, -0.86, -0.30]
 * ```
 */
export function keyLightDirection(spec: ArenaLightingSpec): readonly [number, number, number] {
  const [x, y, z] = spec.key.directionM
  const length = Math.hypot(x, y, z)
  if (length === 0) {
    throw new RangeError(`key.directionM recebeu [0, 0, 0]; esperado vetor com comprimento > 0`)
  }
  return [x / length, y / length, z / length]
}
