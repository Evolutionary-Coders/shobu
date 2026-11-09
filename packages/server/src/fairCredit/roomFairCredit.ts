import {
  type FairCreditMessage,
  type FairCreditRules,
  fairCreditOf,
  type IdTokenClaims,
  isIdTokenFresh,
  type MatchSummaryRow,
  readIdTokenClaims,
} from '@shobu/core'
import type { FairCreditGateway, FairCreditOutcome } from './fairCreditGateway.ts'

/** O que a mesa de crédito de uma sala recebe por injeção. */
export interface RoomFairCreditDeps {
  readonly rules: FairCreditRules
  readonly gateway: FairCreditGateway
  /** O aviso a um jogador; quem não tem cliente (o bot) cai no vazio. */
  readonly send: (playerId: string, message: FairCreditMessage) => void
  /** O relógio de parede, em segundos: é contra ele que o token expira. */
  readonly nowS: () => number
}

/**
 * Folga de validade: o POST leva até alguns segundos, e o token que vence no
 * caminho é recusado pela Feira.
 */
const FRESH_MARGIN_S = 30

interface FairAccount {
  readonly credential: string
  readonly claims: IdTokenClaims
}

/**
 * O crédito da Feira de uma sala (ADR 0036): guarda o login de cada jogador e,
 * quando a partida acaba, paga a cada um o que a linha dele no resumo rende.
 *
 * Uma conta recebe uma vez por partida, mesmo em duas abas. Quem estava com o
 * token vencido fica com o crédito guardado até o login renovado chegar, ou
 * até a partida seguinte acabar.
 *
 * ```ts
 * const fair = new RoomFairCredit({ rules, gateway, send, nowS: () => Date.now() / 1000 })
 * fair.remember('ana', credential)
 * fair.settle(summarizeMatch(board))
 * ```
 */
export class RoomFairCredit {
  readonly #deps: RoomFairCreditDeps
  readonly #accounts = new Map<string, FairAccount>()
  readonly #pending = new Map<string, number>()
  /** Por conta, nesta partida: se o crédito dela já saiu, quando o POST responder. */
  readonly #payments = new Map<string, Promise<boolean>>()

  constructor(deps: RoomFairCreditDeps) {
    this.#deps = deps
  }

  /**
   * O login que o cliente mandou. Token sem a forma do Google é ignorado. Se
   * havia crédito guardado para o jogador, ele sai agora.
   */
  remember(playerId: string, credential: unknown): void {
    if (typeof credential !== 'string') return
    const claims = readIdTokenClaims(credential)
    if (!claims) return
    const account = { credential, claims }
    this.#accounts.set(playerId, account)
    const bricks = this.#pending.get(playerId)
    if (bricks === undefined) return
    this.#pending.delete(playerId)
    this.#pay(playerId, account, bricks)
  }

  /** O jogador saiu da sala: o login e o crédito guardado vão com ele. */
  forget(playerId: string): void {
    this.#accounts.delete(playerId)
    this.#pending.delete(playerId)
  }

  /** O fim da partida: cada linha do resumo, do MVP ao último. */
  settle(rows: readonly MatchSummaryRow[]): void {
    this.#pending.clear()
    this.#payments.clear()
    rows.forEach((row, rank) => {
      this.#settleRow(row.playerId, fairCreditOf(row, rank === 0, this.#deps.rules))
    })
  }

  #settleRow(playerId: string, bricks: number): void {
    const account = this.#accounts.get(playerId)
    if (bricks > 0 && account) {
      this.#pay(playerId, account, bricks)
      return
    }
    this.#deps.send(playerId, { status: bricks === 0 ? 'none' : 'signed-out', bricks })
  }

  /**
   * O POST, ou o aviso de por que ele não sai. A mesma conta noutra aba espera
   * o POST da primeira: só é `duplicate` se ele creditou. Marcar a conta antes
   * da resposta fazia um POST que falhou (ou um token forjado com o `sub` de
   * outro jogador) negar o crédito a quem tinha direito (review do PR #38).
   */
  #pay(playerId: string, account: FairAccount, bricks: number): void {
    const { send, nowS } = this.#deps
    if (!isIdTokenFresh(account.claims, nowS(), FRESH_MARGIN_S)) {
      this.#pending.set(playerId, bricks)
      send(playerId, { status: 'expired', bricks })
      return
    }
    const { sub } = account.claims
    const prior = this.#payments.get(sub)
    const status = prior
      ? prior.then((paid) => (paid ? 'duplicate' : this.#credit(account, bricks)))
      : this.#credit(account, bricks)
    this.#payments.set(
      sub,
      status.then((outcome) => outcome !== 'failed'),
    )
    void status.then((outcome) => send(playerId, { status: outcome, bricks }))
  }

  #credit(account: FairAccount, bricks: number): Promise<FairCreditOutcome> {
    const { gateway, rules } = this.#deps
    return gateway.credit(account.credential, rules.productId, bricks)
  }
}
