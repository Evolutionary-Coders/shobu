import type { FairCreditMessage } from '@shobu/core'

/**
 * A linha que o jogador lê sobre o crédito da Feira no fim da partida, ou
 * `null` quando não há o que dizer (a partida não rendeu tijolinho).
 *
 * ```ts
 * fairCreditText({ status: 'credited', bricks: 3 }) // '+3 TIJOLINHOS NA FEIRA'
 * ```
 */
export function fairCreditText(credit: Readonly<FairCreditMessage>): string | null {
  const bricks = bricksLabel(credit.bricks)
  switch (credit.status) {
    case 'credited':
      return `+${bricks} NA FEIRA`
    case 'signed-out':
      return `ENTRE COM GOOGLE NO MENU PARA GANHAR ${bricks}`
    case 'expired':
      return `RENOVANDO O LOGIN PARA CREDITAR ${bricks}`
    case 'failed':
      return 'NÃO FOI POSSÍVEL CREDITAR NA FEIRA'
    case 'duplicate':
      return 'ESTA CONTA JÁ FOI CREDITADA NESTA PARTIDA'
    case 'unavailable':
      return 'CRÉDITO DA FEIRA DESLIGADO NESTE SERVIDOR'
    case 'none':
      return null
  }
}

function bricksLabel(bricks: number): string {
  return bricks === 1 ? '1 TIJOLINHO' : `${bricks} TIJOLINHOS`
}
