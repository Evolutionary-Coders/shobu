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

export interface MedalFeed {
  /** Empilha as medalhas de uma kill e devolve os toasts, do mais novo ao mais velho. */
  push(awards: readonly MedalAward[], killPoints: number): readonly MedalToast[]
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

export function createMedalFeed(capacity: number = MEDAL_FEED_CAPACITY): MedalFeed {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity recebeu ${capacity}; esperado inteiro >= 1`)
  }
  const toasts: MedalToast[] = []
  return {
    push: (awards, killPoints) => {
      // `unshift` em ordem inversa: a mais rara é a última do prêmio e fica no
      // topo da pilha, que é onde o olho cai primeiro.
      for (const toast of medalToasts(awards, killPoints)) toasts.unshift(toast)
      toasts.length = Math.min(toasts.length, capacity)
      return toasts
    },
  }
}
