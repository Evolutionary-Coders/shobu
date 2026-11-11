import type { FairCreditGateway, FairCreditOutcome } from './fairCreditGateway.ts'

/** Um POST de crédito como o fake o recebeu. */
export interface FairCreditCall {
  readonly userId: number
  readonly bricks: number
}

/**
 * A Feira em memória, para os testes da sala: anota cada crédito e responde
 * `outcome`, que o teste troca para simular a recusa.
 *
 * ```ts
 * const feira = new FakeFairCreditGateway()
 * feira.outcome = 'unknown-user'
 * ```
 */
export class FakeFairCreditGateway implements FairCreditGateway {
  readonly calls: FairCreditCall[] = []
  outcome: FairCreditOutcome = 'credited'

  credit(userId: number, bricks: number): Promise<FairCreditOutcome> {
    this.calls.push({ userId, bricks })
    return Promise.resolve(this.outcome)
  }
}
