/**
 * Do cliente para o servidor: o ID da Feira de quem joga (ADR 0037), ou
 * `null` para quem escolheu jogar sem ID. Vai assim que a sala abre e de novo
 * a cada troca no menu; o servidor guarda o último e credita esse ID quando a
 * partida acaba.
 */
export const FAIR_USER_MESSAGE = 'fair.user'

export interface FairUserMessage {
  readonly userId: number | null
}

/**
 * Do servidor para um jogador, quando a partida acaba: o que a Feira creditou
 * para ele, e o que a tela do resultado diz.
 *
 * - `credited`: `bricks` tijolinhos entraram na conta;
 * - `anonymous`: jogou sem ID da Feira; `bricks` é o que teria ganhado;
 * - `unknown-user`: a Feira não conhece o ID digitado (o 404 do crédito);
 * - `failed`: a Feira recusou por outro motivo ou não respondeu;
 * - `duplicate`: o mesmo ID já foi creditado nesta partida, por outra aba;
 * - `none`: a partida não rendeu tijolinho;
 * - `unavailable`: este servidor está sem crédito (`FAIR_SERVER_TOKEN`
 *   ausente). Vai em resposta ao ID, para quem o digitou saber já no menu que
 *   não vai ganhar nada aqui.
 */
export const FAIR_CREDIT_MESSAGE = 'fair.credit'

export type FairCreditStatus =
  | 'credited'
  | 'anonymous'
  | 'unknown-user'
  | 'failed'
  | 'duplicate'
  | 'none'
  | 'unavailable'

export interface FairCreditMessage {
  readonly status: FairCreditStatus
  readonly bricks: number
}
