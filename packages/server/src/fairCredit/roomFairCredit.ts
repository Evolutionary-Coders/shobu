import {
  type FairCreditMessage,
  type FairCreditRules,
  fairCreditOf,
  type IdTokenClaims,
  isIdTokenFresh,
  type MatchSummaryRow,
  readIdTokenClaims,
} from '@shobu/core'
import type { FairCreditGateway } from './fairCreditGateway.ts'

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
  readonly #paidAccounts = new Set<string>()

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
    this.#paidAccounts.clear()
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

  /** O POST, ou o aviso de por que ele não sai: conta já paga, ou token vencido. */
  #pay(playerId: string, account: FairAccount, bricks: number): void {
    const { gateway, rules, send, nowS } = this.#deps
    const { sub } = account.claims
    if (this.#paidAccounts.has(sub)) {
      send(playerId, { status: 'duplicate', bricks })
      return
    }
    if (!isIdTokenFresh(account.claims, nowS(), FRESH_MARGIN_S)) {
      this.#pending.set(playerId, bricks)
      send(playerId, { status: 'expired', bricks })
      return
    }
    this.#paidAccounts.add(sub)
    void gateway.credit(account.credential, rules.productId, bricks).then((status) => {
      send(playerId, { status, bricks })
    })
  }
}
