/**
 * A API de crédito da Feira de Jogos (ADR 0037), atrás de uma interface do
 * projeto: a sala decide quanto e para quem, e só este adapter fala HTTP.
 */
export interface FairCreditGateway {
  /** Credita `bricks` tijolinhos ao jogador `userId` da Feira; nunca rejeita. */
  credit(userId: number, bricks: number): Promise<FairCreditOutcome>
}

/** `unknown-user` é o 404 da Feira: o ID digitado não existe lá. */
export type FairCreditOutcome = 'credited' | 'unknown-user' | 'failed'

/** O que a rota responde quando creditou (`postGameCredit.js` da Feira). */
const CREDITED_STATUS = 201
const UNKNOWN_USER_STATUS = 404

/**
 * O POST da rota `gameCredit` da Feira (feira-de-jogos/feira-de-jogos,
 * `nuvem/rest-api/routes/postGameCredit.js`): `Authorization: Bearer <token
 * do servidor>` e `{ userId, price }`, em que `price` são os tijolinhos. O
 * jogo é o dono do token, e por isso o corpo não diz qual é. Só o 201 é
 * crédito; falha de rede ou outro status vira `failed` e uma linha de log, e o
 * crédito não para a sala. O log nunca leva o token.
 *
 * ```ts
 * new HttpFairCreditGateway(rules.creditUrl, rules.serverToken).credit(42, 3)
 * ```
 */
export class HttpFairCreditGateway implements FairCreditGateway {
  readonly #url: string
  readonly #serverToken: string

  constructor(url: string, serverToken: string) {
    this.#url = url
    this.#serverToken = serverToken
  }

  async credit(userId: number, bricks: number): Promise<FairCreditOutcome> {
    try {
      const response = await fetch(this.#url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.#serverToken}`,
        },
        body: JSON.stringify({ userId, price: bricks }),
        signal: AbortSignal.timeout(10_000),
      })
      // o corpo não interessa, mas sem lê-lo o undici segura o socket até o gc,
      // e cada fim de partida abre um POST por jogador com ID.
      await response.body?.cancel()
      const outcome = outcomeOfStatus(response.status)
      console.log(
        JSON.stringify({ event: `fair.${outcome}`, status: response.status, userId, bricks }),
      )
      return outcome
    } catch (error) {
      console.log(JSON.stringify({ event: 'fair.failed', userId, bricks, error: String(error) }))
      return 'failed'
    }
  }
}

function outcomeOfStatus(status: number): FairCreditOutcome {
  if (status === CREDITED_STATUS) return 'credited'
  return status === UNKNOWN_USER_STATUS ? 'unknown-user' : 'failed'
}
