import { PING_MS_MAX } from '@shobu/core'
import type { RoomSimulation } from './roomSimulation.ts'

/**
 * Anota o rtt que o cliente relatou (`PING_REPORT_MESSAGE`) no assento dele,
 * para a coluna do tab. O número vem da rede e é do cliente: só número finito,
 * preso entre 0 e `PING_MS_MAX` e arredondado. Cosmético — nunca chega ao
 * rewind nem ao matchmaking (ADR 0031) —, então mentir só muda a coluna.
 * Devolve se aceitou, para quem chama registrar o recusado.
 *
 * ```ts
 * if (!notePing(room, client.sessionId, message?.rttMs)) log(...)
 * ```
 */
export function notePing(room: RoomSimulation, playerId: string, raw: unknown): boolean {
  const seat = room.seats.get(playerId)
  if (!seat || typeof raw !== 'number' || !Number.isFinite(raw)) return false
  seat.pingMs = Math.round(Math.min(PING_MS_MAX, Math.max(0, raw)))
  return true
}
