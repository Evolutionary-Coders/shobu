/**
 * O aviso de inatividade no hud (ADR 0031): a sala avisa quem está parado, e
 * a tela conta os segundos até a saída, em segundos inteiros, até o primeiro
 * input de verdade apagá-lo (`afkSecondsLeft`).
 */

/**
 * Os segundos inteiros que a tela mostra, ou `null` sem aviso. É o que o laço
 * compara a cada quadro: número igual, nada a escrever.
 *
 * ```ts
 * afkWarningSeconds(network.afkSecondsLeft()) // 12
 * ```
 */
export function afkWarningSeconds(secondsLeft: number | undefined): number | null {
  return secondsLeft === undefined ? null : Math.ceil(secondsLeft)
}

/**
 * ```ts
 * afkWarningText(12) // 'INATIVO — SAINDO EM 12 S'
 * afkWarningText(null) // null: apaga
 * ```
 */
export function afkWarningText(seconds: number | null): string | null {
  return seconds === null ? null : `INATIVO — SAINDO EM ${seconds} S`
}
