import {
  type FairCreditMessage,
  type FairCreditRules,
  type FairCreditStatus,
  fairCreditOf,
  fairUserIdOf,
  type MatchSummaryRow,
} from '@shobu/core'
import type { FairCreditGateway } from './fairCreditGateway.ts'

/** O que a mesa de crédito de uma sala recebe por injeção. */
export interface RoomFairCreditDeps {
  readonly rules: FairCreditRules
  readonly gateway: FairCreditGateway
  /** O aviso a um jogador; quem não tem cliente (o bot) cai no vazio. */
  readonly send: (playerId: string, message: FairCreditMessage) => void
}

/**
 * O crédito da Feira de uma sala (ADR 0037): guarda o ID da Feira de cada
 * jogador e, quando a partida acaba, paga a cada um o que a linha dele no
 * resumo rende.
 *
 * Um ID recebe uma vez por partida, mesmo em duas abas.
 *
 * ```ts
 * const fair = new RoomFairCredit({ rules, gateway, send })
 * fair.remember('ana', 42)
 * fair.settle(summarizeMatch(board))
 * ```
 */
export class RoomFairCredit {
  readonly #deps: RoomFairCreditDeps
  readonly #userIds = new Map<string, number>()
  /** Por ID, nesta partida: se o crédito dele já saiu, quando o POST responder. */
  readonly #payments = new Map<number, Promise<boolean>>()

  constructor(deps: RoomFairCreditDeps) {
    this.#deps = deps
  }

  /**
   * O ID que o cliente mandou. O que não tem forma de ID (o `null` de quem
   * escolheu jogar sem) apaga o anterior: a troca no menu vale na hora.
   */
  remember(playerId: string, userId: unknown): void {
    const id = fairUserIdOf(userId)
    if (id === undefined) this.#userIds.delete(playerId)
    else this.#userIds.set(playerId, id)
  }

  /** O jogador saiu da sala: o ID vai com ele. */
  forget(playerId: string): void {
    this.#userIds.delete(playerId)
  }

  /** O fim da partida: cada linha do resumo, do MVP ao último. */
  settle(rows: readonly MatchSummaryRow[]): void {
    this.#payments.clear()
    rows.forEach((row, rank) => {
      this.#settleRow(row.playerId, fairCreditOf(row, rank === 0, this.#deps.rules))
    })
  }

  #settleRow(playerId: string, bricks: number): void {
    const userId = this.#userIds.get(playerId)
    if (bricks > 0 && userId !== undefined) {
      this.#pay(playerId, userId, bricks)
      return
    }
    this.#deps.send(playerId, { status: bricks === 0 ? 'none' : 'anonymous', bricks })
  }

  /**
   * O POST. O mesmo ID noutra aba espera o POST da primeira: só é `duplicate`
   * se ele creditou. Marcar o ID antes da resposta fazia um POST que falhou
   * negar o crédito a quem tinha direito (review do PR #38).
   */
  #pay(playerId: string, userId: number, bricks: number): void {
    const prior = this.#payments.get(userId)
    const status: Promise<FairCreditStatus> = prior
      ? prior.then((paid) => (paid ? 'duplicate' : this.#deps.gateway.credit(userId, bricks)))
      : this.#deps.gateway.credit(userId, bricks)
    this.#payments.set(
      userId,
      status.then((outcome) => outcome === 'credited' || outcome === 'duplicate'),
    )
    void status.then((outcome) => this.#deps.send(playerId, { status: outcome, bricks }))
  }
}
