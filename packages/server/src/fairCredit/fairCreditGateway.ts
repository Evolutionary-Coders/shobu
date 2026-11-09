/**
 * A API de crédito da Feira de Jogos (ADR 0036), atrás de uma interface do
 * projeto: a sala decide quanto e para quem, e só este adapter fala HTTP.
 */
export interface FairCreditGateway {
  /** Credita `value` tijolinhos na conta dona de `credential`; nunca rejeita. */
  credit(credential: string, productId: number, value: number): Promise<FairCreditOutcome>
}

export type FairCreditOutcome = 'credited' | 'failed'

/**
 * O POST que o exemplo da Feira faz (tes786205/game, `751edf7a8c`):
 * `Authorization: Bearer <ID token>` e `{ product, value }`. Falha de rede ou
 * status fora de 2xx vira `failed` e uma linha de log; o crédito não para a
 * sala.
 *
 * ```ts
 * new HttpFairCreditGateway(rules.creditUrl).credit(token, rules.productId, 3)
 * ```
 */
export class HttpFairCreditGateway implements FairCreditGateway {
  readonly #url: string

  constructor(url: string) {
    this.#url = url
  }

  async credit(credential: string, productId: number, value: number): Promise<FairCreditOutcome> {
    try {
      const response = await fetch(this.#url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credential}` },
        body: JSON.stringify({ product: productId, value }),
        signal: AbortSignal.timeout(10_000),
      })
      // o corpo não interessa, mas sem lê-lo o undici segura o socket até o gc,
      // e cada fim de partida abre um POST por jogador logado.
      await response.body?.cancel()
      const outcome = response.ok ? 'credited' : 'failed'
      console.log(JSON.stringify({ event: `fair.${outcome}`, status: response.status, value }))
      return outcome
    } catch (error) {
      console.log(JSON.stringify({ event: 'fair.failed', value, error: String(error) }))
      return 'failed'
    }
  }
}
