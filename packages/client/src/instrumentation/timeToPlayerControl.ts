/**
 * O pilar 2 é medido, não afirmado: cinco segundos do clique no link ao
 * controle do personagem. Enquanto não houver medição em rede de verdade, o
 * número que aparece no hud é o da máquina de quem está desenvolvendo — que é
 * otimista, e é por isso que ele fica visível em vez de escondido em log.
 */
export const TIME_TO_CONTROL_BUDGET_MS = 5_000

export function timeToControlMs(navigationStartMs: number, controlAcquiredMs: number): number {
  if (!Number.isFinite(navigationStartMs) || !Number.isFinite(controlAcquiredMs)) {
    throw new RangeError(
      `timeToControlMs recebeu ${navigationStartMs} e ${controlAcquiredMs}; esperado dois números finitos`,
    )
  }
  if (controlAcquiredMs < navigationStartMs) {
    throw new RangeError(
      `controlAcquiredMs ${controlAcquiredMs} é anterior a navigationStartMs ${navigationStartMs}`,
    )
  }
  return controlAcquiredMs - navigationStartMs
}

/**
 * ```ts
 * describeTimeToControl(1240) // '1.24 s / 5 s — dentro do pilar 2'
 * ```
 */
export function describeTimeToControl(elapsedMs: number): string {
  const budgetS = TIME_TO_CONTROL_BUDGET_MS / 1000
  const verdict =
    elapsedMs <= TIME_TO_CONTROL_BUDGET_MS ? 'dentro do pilar 2' : 'estourou o pilar 2'
  return `${(elapsedMs / 1000).toFixed(2)} s / ${budgetS} s — ${verdict}`
}
