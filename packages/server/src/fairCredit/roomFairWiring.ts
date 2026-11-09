import type { Client, Room } from '@colyseus/core'
import {
  FAIR_CREDENTIAL_MESSAGE,
  FAIR_CREDIT_MESSAGE,
  type FairCredentialMessage,
  type FairCreditMessage,
  type FairCreditRules,
} from '@shobu/core'
import type { FairCreditGateway } from './fairCreditGateway.ts'
import { RoomFairCredit } from './roomFairCredit.ts'

/** O crédito da Feira que o servidor liga (ADR 0036), igual para todas as salas. */
export interface FairCreditSetup {
  readonly rules: FairCreditRules
  readonly gateway: FairCreditGateway
}

/**
 * A mesa de cada sala, ao lado da sala e não nela: a classe da sala já está no
 * teto de tamanho, e a mesa só existe com o crédito ligado.
 */
const roomDesks = new WeakMap<object, RoomFairCredit>()

/**
 * Abre a mesa de crédito de uma sala do colyseus, que avisa cada jogador pelo
 * cliente dele; o bot não tem cliente, e o aviso dele cai no vazio. Sem
 * `setup`, a sala roda sem crédito.
 *
 * ```ts
 * openFairCredit(room, deps.fair) // no onCreate
 * ```
 */
export function openFairCredit(
  room: Pick<Room, 'clients'>,
  setup: FairCreditSetup | undefined,
): void {
  if (!setup) return
  const desk = new RoomFairCredit({
    ...setup,
    send: (playerId, message) => room.clients.getById(playerId)?.send(FAIR_CREDIT_MESSAGE, message),
    nowS: () => Date.now() / 1000,
  })
  roomDesks.set(room, desk)
}

/**
 * A mesa da sala, ou `undefined` com o crédito desligado.
 *
 * ```ts
 * fairCreditOf(room)?.settle(rows)
 * ```
 */
export function fairCreditOf(room: object): RoomFairCredit | undefined {
  return roomDesks.get(room)
}

/** A resposta ao login de um servidor sem crédito (`FAIR_PRODUCT_ID` ausente). */
const CREDIT_UNAVAILABLE: FairCreditMessage = { status: 'unavailable', bricks: 0 }

/**
 * O login que o cliente manda (`FAIR_CREDENTIAL_MESSAGE`), levado à mesa da
 * sala na hora da mensagem. Sem mesa, o crédito está desligado neste servidor,
 * e quem entrou com o Google fica sabendo na hora, e não no fim da partida.
 *
 * ```ts
 * override messages = { ...clientMessages(simulation), ...fairCreditMessages(this) }
 * ```
 */
export function fairCreditMessages(room: object) {
  return {
    [FAIR_CREDENTIAL_MESSAGE]: (
      client: Client,
      message: Partial<FairCredentialMessage> | undefined,
    ) => {
      const desk = fairCreditOf(room)
      if (desk) desk.remember(client.sessionId, message?.credential)
      else client.send(FAIR_CREDIT_MESSAGE, CREDIT_UNAVAILABLE)
    },
  }
}
