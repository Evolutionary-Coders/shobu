/**
 * Contagem regressiva em décimos de segundo, como a tela a escreve.
 *
 * Mora fora do `boundaryWarning.ts` porque o aviso de fora da área deixou de
 * ser o único dono dela: a recarga do gancho conta do mesmo jeito, e dois
 * arredondamentos escritos à mão cedo ou tarde discordariam no último décimo.
 */

/**
 * A folga contra o erro de ponto flutuante: `4.9 * 10` dá `49.000000000000004`,
 * e sem ela `Math.ceil` mostraria `5,0` com 4,9 s restantes.
 */
const TENTH_EPSILON = 1e-6

/**
 * Os décimos restantes, arredondados **para cima**: o primeiro quadro de uma
 * contagem mostra o prazo inteiro, e o `0,0` só aparece quando acabou.
 *
 * ```ts
 * ceilTenths(4.93) // 50
 * ```
 *
 * @throws RangeError tempo não finito
 */
export function ceilTenths(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    throw new RangeError(`seconds recebeu ${seconds}; esperado número finito`)
  }
  return Math.max(0, Math.ceil(seconds * 10 - TENTH_EPSILON))
}

/**
 * Segundos e décimos com vírgula, como se escreve número em português.
 *
 * ```ts
 * tenthsLabel(49) // '4,9'
 * ```
 */
export function tenthsLabel(tenths: number): string {
  return `${Math.floor(tenths / 10)},${tenths % 10}`
}
