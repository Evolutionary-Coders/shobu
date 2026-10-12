/**
 * O tanque da corrida tática plena como o visor o escreve: um inteiro de 0 a
 * 99, ou `null` com o tanque cheio — e cheio o indicador some, porque ele só
 * diz alguma coisa enquanto o jogador está gastando ou esperando o tanque.
 *
 * Inteiro, e não a razão crua, para quem escreve no dom ter uma guarda de
 * mudança: a 60 Hz a razão muda todo quadro, o inteiro muda uma vez a cada 30.
 *
 * ```ts
 * sprintTankPercent(1)    // null
 * sprintTankPercent(0.42) // 42
 * ```
 */
export function sprintTankPercent(ratio: number): number | null {
  if (ratio >= FULL_RATIO) return null
  return Math.max(0, Math.floor(ratio * 100))
}

/** Abaixo de um milésimo de cheio ainda é cheio: o enchimento chega por soma de ponto flutuante. */
const FULL_RATIO = 0.999
