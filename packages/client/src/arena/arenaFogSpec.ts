/**
 * A névoa da arena, como dado. É o item mais barato da cena — o
 * `StandardMaterial` já calcula névoa, então não há passe nem draw call a
 * pagar — e o que mais muda a imagem: de dia ela é a neblina de cidade que
 * separa a rua jogável dos prédios de fundo, que sem ela chegariam ao olho com
 * o **mesmo contraste** da arena.
 *
 * Não importa nada da engine de propósito: `arenaFog.ts` traduz isto para o
 * babylon, e o teste vigia os números sem precisar de cena.
 */

import type { PlayArea } from '@shobu/core'
import { daySkySpec, type Rgb } from './daySky.ts'

export type { Rgb }

export interface ArenaFogSpec {
  /**
   * A cor para onde tudo desbota. **É o horizonte do céu** (`daySky.ts`), lido
   * de lá e não copiado: cor de névoa diferente da cor do céu devolve a linha
   * do horizonte que a névoa existe para apagar.
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
 * A maior linha de visão **dentro** da arena: a diagonal da área de jogo. É a
 * distância entre dois jogadores nas quinas opostas, e é ela — não um número
 * escolhido — que decide a densidade.
 *
 * A área e não o piso: desde a ADR 0011 o piso é do bairro inteiro, e a névoa
 * medida por ele ficaria tão rala que o fundo voltaria ao contraste da arena.
 *
 * ```ts
 * arenaSightLineM(ICHIBAN_GAI_PLAY_AREA) // 76.84
 * ```
 */
export function arenaSightLineM(area: PlayArea): number {
  const width = area.maxX - area.minX
  const depth = area.maxZ - area.minZ
  if (!(width > 0 && depth > 0)) {
    throw new RangeError(
      `area recebeu ${width} × ${depth} m; esperado retângulo com os dois lados > 0`,
    )
  }
  return Math.hypot(width, depth)
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
    colorRgb: daySkySpec().horizonRgb,
    // 0,0035 é o maior valor que ainda deixa 0,9 de transmitância na diagonal
    // do piso. Subir daqui começa a apagar alvo; descer devolve os prédios de
    // fundo ao mesmo contraste da arena, que é o defeito que a névoa conserta.
    density: 0.0035,
  }
}
