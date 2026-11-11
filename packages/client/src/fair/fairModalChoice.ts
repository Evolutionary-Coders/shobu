import { fairUserIdOf } from '@shobu/core'

/** O que o jogador fez no modal do ID da Feira. */
export type FairModalAction =
  | { readonly kind: 'confirm'; readonly text: string }
  | { readonly kind: 'skip' }
  | { readonly kind: 'cancel' }

/** O modal fecha com uma escolha, ou fica aberto mostrando o erro. */
export type FairModalOutcome = { readonly close: number | null } | { readonly error: string }

export const INVALID_FAIR_ID_TEXT = 'DIGITE SÓ OS NÚMEROS DO SEU ID DA FEIRA'

/**
 * A decisão do modal (ADR 0037), longe do dom para ser testada. Confirmar só
 * fecha com um ID que tem forma de ID. Jogar sem ID é `null`. Cancelar (o
 * ESC) devolve o ID que já havia: quem abriu o TROCAR e desistiu não perde o
 * ID (review do PR #49).
 *
 * ```ts
 * fairModalOutcome({ kind: 'cancel' }, 42) // { close: 42 }
 * ```
 */
export function fairModalOutcome(
  action: FairModalAction,
  current: number | null,
): FairModalOutcome {
  if (action.kind === 'skip') return { close: null }
  if (action.kind === 'cancel') return { close: current }
  const userId = fairUserIdOf(action.text)
  return userId === undefined ? { error: INVALID_FAIR_ID_TEXT } : { close: userId }
}
