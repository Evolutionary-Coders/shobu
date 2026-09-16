/**
 * A névoa da arena, como dado. É o item mais barato da cena — o
 * `StandardMaterial` já calcula névoa, então não há passe nem draw call a
 * pagar — e o que mais muda a imagem: sem ela a arena de 64 m e a cidade de
 * `skylineRing.ts` a 133 m chegam ao olho com o **mesmo contraste**, e a
 * imagem inteira fica sem profundidade.
 *
 * O que ela conserta, em ordem: separa a arena do fundo, dissolve a emenda
 * entre as cópias do anel, e dá à silhueta da camada `top` um fundo que
 * escurece com a distância em vez de um recorte duro.
 *
 * Não importa nada da engine de propósito: `arenaFog.ts` traduz isto para o
 * babylon, e o teste vigia os números sem precisar de cena.
 */
import type { GreyboxBlock } from './greyboxBlockout.ts'

export type Rgb = readonly [number, number, number]

export interface ArenaFogSpec {
  /**
   * A cor para onde tudo desbota. **É também o horizonte do céu** — quem
   * consome as duas é `deadChannelSky.ts`, e uma constante só para as duas
   * porque cor de névoa diferente da cor do céu devolve a linha do horizonte
   * que a névoa existe para apagar.
   */
  readonly colorRgb: Rgb
  /** O `fogDensity` do modo exponencial ao quadrado. Derivado, não escolhido. */
  readonly density: number
}

/**
 * Quanto da cor original sobra depois de `distanceM` metros de névoa, no modo
 * exponencial ao quadrado — o mesmo `exp(-(d·z)²)` que o babylon calcula no
 * shader. 1 é ver perfeitamente, 0 é ver só névoa.
 *
 * ```ts
 * fogTransmittance(0.0035, 90.5) // 0.9046
 * ```
 */
export function fogTransmittance(density: number, distanceM: number): number {
  if (density < 0) {
    throw new RangeError(`density recebeu ${density}; esperado número >= 0`)
  }
  return Math.exp(-((density * distanceM) ** 2))
}

/**
 * A maior linha de visão **dentro** da arena: a diagonal da maior pegada do
 * blockout, que é o piso. É a distância entre dois jogadores nas quinas
 * opostas, e é ela — não um número escolhido — que decide a densidade.
 *
 * Medida sobre o blockout e não escrita à mão porque o piso pode crescer: a
 * névoa tem que crescer junto, senão o alvo da quina nova começa a sumir.
 *
 * ```ts
 * arenaSightLineM(GREYBOX_BLOCKOUT) // 90.51
 * ```
 */
export function arenaSightLineM(blockout: readonly GreyboxBlock[]): number {
  if (blockout.length === 0) {
    throw new RangeError('blockout recebeu lista vazia; esperado ao menos um bloco de arena')
  }
  return Math.max(...blockout.map(({ sizeM }) => Math.hypot(sizeM[0], sizeM[2])))
}

/**
 * O piso de transmitância na maior linha de visão da arena. **É regra de
 * jogabilidade, não de arte**: o pilar 1 diz que um tiro mata, e alvo que
 * some atrás de decoração tira do jogador a única coisa que o jogo promete.
 * 0,9 é o ponto em que a névoa ainda não tocou o contraste do alvo.
 */
export const MIN_SIGHT_LINE_TRANSMITTANCE = 0.9

/**
 * ```ts
 * arenaFogSpec().density // 0.0035
 * ```
 */
export function arenaFogSpec(): ArenaFogSpec {
  return {
    // cinza de chuvisco, com um empurrão de violeta: é poluição luminosa da
    // cidade do anel batendo na base da atmosfera, e é o que impede a névoa de
    // ler como neblina de dia. Luminância baixa de propósito — é o fundo de
    // toda silhueta da camada `top`.
    colorRgb: [0.14, 0.13, 0.16],
    // 0,0035 é o maior valor que ainda deixa 0,904 de transmitância nos 90,5 m
    // da diagonal do piso. Subir daqui começa a apagar alvo; descer devolve a
    // skyline ao mesmo contraste da arena, que é o defeito que a névoa conserta.
    density: 0.0035,
  }
}
