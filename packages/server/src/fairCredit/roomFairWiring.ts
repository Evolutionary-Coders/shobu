import type { Client, Room } from '@colyseus/core'
import {
  FAIR_CREDIT_MESSAGE,
  FAIR_USER_MESSAGE,
  type FairCreditMessage,
  type FairCreditRules,
  type FairUserMessage,
} from '@shobu/core'
import type { FairCreditGateway } from './fairCreditGateway.ts'
import { RoomFairCredit } from './roomFairCredit.ts'

/** O crédito da Feira que o servidor liga (ADR 0037), igual para todas as salas. */
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
  })
  roomDesks.set(room, desk)
}

/**
 * A mesa da sala, ou `undefined` com o crédito desligado.
 *
 * ```ts
 * roomFairDesk(room)?.settle(rows)
 * ```
 */
export function roomFairDesk(room: object): RoomFairCredit | undefined {
  return roomDesks.get(room)
}

/** A resposta ao ID de um servidor sem crédito (`FAIR_SERVER_TOKEN` ausente). */
const CREDIT_UNAVAILABLE: FairCreditMessage = { status: 'unavailable', bricks: 0 }

/**
 * O ID da Feira que o cliente manda (`FAIR_USER_MESSAGE`), levado à mesa da
 * sala na hora da mensagem. Sem mesa, o crédito está desligado neste servidor,
 * e quem digitou um ID fica sabendo na hora, e não no fim da partida.
 *
 * ```ts
 * override messages = { ...clientMessages(simulation), ...fairCreditMessages(this) }
 * ```
 */
export function fairCreditMessages(room: object) {
  return {
    [FAIR_USER_MESSAGE]: (client: Client, message: Partial<FairUserMessage> | undefined) => {
      const desk = roomFairDesk(room)
      if (desk) desk.remember(client.sessionId, message?.userId)
      else if (message?.userId != null) client.send(FAIR_CREDIT_MESSAGE, CREDIT_UNAVAILABLE)
    },
  }
}
