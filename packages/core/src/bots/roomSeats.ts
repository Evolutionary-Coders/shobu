/**
 * Quantos bots a sala pede: as vagas que os humanos não ocuparam. É a regra
 * inteira de "bots preenchem a sala", sem nada de rede, para o servidor
 * chamá-la a cada entrada e saída de jogador e o cliente sozinho chamá-la uma
 * vez (ADR 0016).
 *
 * Sala cheia ou mais que cheia não pede bot nenhum: quem decide recusar o
 * quinto jogador é o servidor, não esta conta.
 *
 * ```ts
 * botSeatsFor(config.match.playersPerRoom, 1) // 3
 * botSeatsFor(4, 4) // 0
 * ```
 */
export function botSeatsFor(playersPerRoom: number, humans: number): number {
  assertCount(playersPerRoom, 'playersPerRoom')
  assertCount(humans, 'humans')
  return Math.max(0, playersPerRoom - humans)
}

function assertCount(value: number, label: string): void {
  if (Number.isInteger(value) && value >= 0) return
  throw new RangeError(`botSeatsFor recebeu ${label} ${value}; esperado inteiro >= 0`)
}
