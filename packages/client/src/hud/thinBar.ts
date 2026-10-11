/**
 * A barra fina do HUD: um traço de poucos px que enche da esquerda para a
 * direita, no desenho da vida do Metal Gear Rising.
 *
 * **O traço fantasma é css, não conta.** A barra tem duas camadas com o mesmo
 * `--bar-fill`: a de cima muda na hora, e a de baixo, mais clara, anda com
 * atraso de transição. Quando a barra cai, o pedaço que sobrou da de baixo é o
 * fantasma, e ele some sozinho; quando a barra sobe, a de cima cobre a de
 * baixo e não há fantasma nenhum. Por isso este módulo só entrega o número:
 * quem desenha e atrasa é o `arenaComponents.css`.
 */

/**
 * O quanto a barra está cheia, de 0 a 1, com o valor preso na faixa: tempo
 * negativo de um quadro atrasado não vira barra invertida.
 *
 * ```ts
 * thinBarFraction(150, 300) // 0.5
 * ```
 *
 * @throws RangeError máximo que não é positivo, ou valor não finito
 */
export function thinBarFraction(value: number, max: number): number {
  if (!(Number.isFinite(max) && max > 0)) {
    throw new RangeError(`max recebeu ${max}; esperado número finito > 0`)
  }
  if (!Number.isFinite(value)) {
    throw new RangeError(`value recebeu ${value}; esperado número finito`)
  }
  return Math.min(1, Math.max(0, value / max))
}

/**
 * Em quantos trechos as marcas de divisão cortam a barra: uma marca a cada
 * `step`, arredondando para cima para o último trecho curto também contar.
 *
 * ```ts
 * thinBarDivisions(300, 60) // 5, uma marca por minuto de partida
 * ```
 *
 * @throws RangeError total ou passo que não são positivos
 */
export function thinBarDivisions(total: number, step: number): number {
  if (!(Number.isFinite(total) && total > 0)) {
    throw new RangeError(`total recebeu ${total}; esperado número finito > 0`)
  }
  if (!(Number.isFinite(step) && step > 0)) {
    throw new RangeError(`step recebeu ${step}; esperado número finito > 0`)
  }
  return Math.ceil(total / step)
}
