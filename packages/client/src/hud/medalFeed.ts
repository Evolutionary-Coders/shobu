import type { MedalAward, MedalRarity } from '@shobu/core'
import { killPointsField } from './visorFields.ts'

/**
 * O feed de medalhas, no topo central do visor: ícone, pontos e nome, no
 * desenho do black ops 2 que a [`docs/medals.md`](../../../../docs/medals.md)
 * cita como origem do pedido.
 *
 * **Sem relógio**, como o `killfeed.ts`: o toast some por animação de css,
 * casada com `MEDAL_LIFETIME_MS`. Este módulo só limita a capacidade e
 * formata.
 *
 * ```ts
 * medalToasts(awards, config.match.pointsPerKill)[0]?.points // '+150'
 * ```
 */
/**
 * Quantos toasts cabem na pilha. **É o dom que guarda a pilha**, e não um
 * modelo com estado aqui: o toast some por animação de css, então reescrever a
 * lista inteira a cada medalha faria um prêmio de cinco minutos atrás voltar ao
 * centro da tela replicando a animação de entrada — e ser reanunciado pelo
 * leitor de tela, que é o que o `aria-live` deste feed promete não fazer.
 */
export const MEDAL_FEED_CAPACITY = 3

/** Casado com `medal-toast-out` em arenaMedals.css. */
export const MEDAL_LIFETIME_MS = 3_400

export interface MedalToast {
  /** Já com o sinal: é o `+150` que o pedido descreve. */
  readonly points: string
  readonly label: string
  readonly iconUrl: string
  readonly rarity: MedalRarity
}

export function medalIconUrl(slug: string): string {
  return `/assets/images/medals/${slug}.webp`
}

/**
 * O **primeiro** toast de uma kill carrega os pontos da kill somados ao bônus
 * dele; os seguintes, só o próprio bônus.
 *
 * A esmagadora maioria das kills concede uma medalha só, e nesse caso o toast
 * lê exatamente o total da jogada — `+150 / DOUBLE KILL`. Somar a base em
 * todos faria três medalhas na mesma kill mostrarem `+150` três vezes, e a
 * soma da tela deixaria de bater com a do placar.
 */
export function medalToasts(
  awards: readonly MedalAward[],
  killPoints: number,
): readonly MedalToast[] {
  return awards.map((award, index) => ({
    points: killPointsField(award.points + (index === 0 ? killPoints : 0)),
    label: award.medal.label,
    iconUrl: medalIconUrl(award.medal.slug),
    rarity: award.medal.rarity,
  }))
}
