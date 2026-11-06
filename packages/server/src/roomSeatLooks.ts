import { freeAccentOf, isBenched, serverBotAccentOf } from '@shobu/core'
import type { RoomSimulation } from './roomSimulation.ts'

/**
 * O neon de quem acabou de entrar: o menor acento que nenhum outro assento e
 * nenhum bot sentado usa (`freeAccentOf`). A sala decide, e não cada cliente
 * pela vaga local em que o jogador caiu: assim todo mundo vê a mesma cor.
 *
 * ```ts
 * seat.accent = freeSeatAccentOf(room, playerId)
 * ```
 */
export function freeSeatAccentOf(room: RoomSimulation, playerId: string): number {
  const taken: number[] = []
  for (const [id, seat] of room.seats) if (id !== playerId) taken.push(seat.accent)
  room.bots.squad.bots.forEach((bot, index) => {
    if (!isBenched(bot)) taken.push(serverBotAccentOf(index))
  })
  return freeAccentOf(taken)
}
