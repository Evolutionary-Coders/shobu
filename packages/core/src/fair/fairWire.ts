/**
 * Do cliente para o servidor: o ID token do Google de quem entrou com a conta
 * (ADR 0036). Vai assim que a sala abre e de novo a cada renovação do login;
 * o servidor guarda o último e o leva à Feira quando a partida acaba.
 */
export const FAIR_CREDENTIAL_MESSAGE = 'fair.credential'

export interface FairCredentialMessage {
  readonly credential: string
}

/**
 * Do servidor para um jogador, quando a partida acaba: o que a Feira creditou
 * para ele, e o que a tela do resultado diz.
 *
 * - `credited`: `bricks` tijolinhos entraram na conta;
 * - `signed-out`: não entrou com o Google; `bricks` é o que teria ganhado;
 * - `expired`: o token venceu; o servidor guarda o crédito até o novo chegar;
 * - `failed`: a Feira recusou ou não respondeu;
 * - `duplicate`: a mesma conta já foi creditada nesta partida, por outra aba;
 * - `none`: a partida não rendeu tijolinho.
 */
export const FAIR_CREDIT_MESSAGE = 'fair.credit'

export type FairCreditStatus =
  | 'credited'
  | 'signed-out'
  | 'expired'
  | 'failed'
  | 'duplicate'
  | 'none'

export interface FairCreditMessage {
  readonly status: FairCreditStatus
  readonly bricks: number
}
