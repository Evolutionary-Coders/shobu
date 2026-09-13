import type { MedalAward, MedalRarity } from '@shobu/core'

/**
 * O feed de medalhas, no desenho do black ops 2 que a
 * [`docs/medals.md`](../../../../docs/medals.md) cita como origem do pedido:
 * **a medalha celebra no topo, e a retícula leva o registro**.
 *
 * O toast do topo é só o ícone grande e o nome — **sem número**. O `+xxx` e a
 * lista do que o rendeu ficam na diagonal da retícula (`#hud-killpoints`),
 * onde o olho já está. Separar os dois é o que deixa a medalha ser um prêmio
 * em vez de mais uma linha de placar.
 *
 * **Sem relógio**, como o `killfeed.ts`: quem faz o toast entrar e sair é a
 * animação de css, casada com `MEDAL_LIFETIME_MS`.
 *
 * ```ts
 * medalToasts(awards)[0]?.label // 'DOUBLE KILL'
 * medalLabels(awards)           // ['DOUBLE KILL', 'HEADSHOT']
 * ```
 */

/** Casado com `medal-toast-out` em arenaMedals.css. */
export const MEDAL_LIFETIME_MS = 2_600

export interface MedalToast {
  /** Já em caixa alta, como o catálogo guarda. */
  readonly label: string
  readonly iconUrl: string
  readonly rarity: MedalRarity
}

export function medalIconUrl(slug: string): string {
  return `/assets/images/medals/${slug}.webp`
}

export function medalToasts(awards: readonly MedalAward[]): readonly MedalToast[] {
  return awards.map((award) => ({
    label: award.medal.label,
    iconUrl: medalIconUrl(award.medal.slug),
    rarity: award.medal.rarity,
  }))
}

/**
 * **Uma medalha de cada vez.** Três medalhas na mesma kill não cabem no topo
 * lado a lado sem virar placar, então elas entram em fila: cada toast começa
 * quando o anterior terminou.
 *
 * A fila é **atraso de css**, e não um relógio em javascript — o hud não tem
 * `setTimeout` nem `requestAnimationFrame` (ver `arenaHud.ts`). Antes do
 * próprio atraso o toast está no quadro 0% da animação, que é invisível.
 *
 * ```ts
 * toastDelayMs(1) // 2600
 * ```
 */
export function toastDelayMs(index: number): number {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`toastDelayMs recebeu ${index}; esperado inteiro >= 0`)
  }
  return index * MEDAL_LIFETIME_MS
}

/** Os nomes que acompanham o `+xxx` na retícula, na ordem em que foram ganhos. */
export function medalLabels(awards: readonly MedalAward[]): readonly string[] {
  return awards.map((award) => award.medal.label)
}
