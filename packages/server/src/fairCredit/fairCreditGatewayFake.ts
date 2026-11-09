import type { FairCreditGateway, FairCreditOutcome } from './fairCreditGateway.ts'

/** Um POST de crédito como o fake o recebeu. */
export interface FairCreditCall {
  readonly credential: string
  readonly productId: number
  readonly value: number
}

/**
 * A Feira em memória, para os testes da sala: anota cada crédito e responde
 * `outcome`, que o teste troca para simular a recusa.
 *
 * ```ts
 * const feira = new FakeFairCreditGateway()
 * feira.outcome = 'failed'
 * ```
 */
export class FakeFairCreditGateway implements FairCreditGateway {
  readonly calls: FairCreditCall[] = []
  outcome: FairCreditOutcome = 'credited'

  credit(credential: string, productId: number, value: number): Promise<FairCreditOutcome> {
    this.calls.push({ credential, productId, value })
    return Promise.resolve(this.outcome)
  }
}
