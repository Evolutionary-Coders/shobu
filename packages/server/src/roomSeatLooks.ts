import { botAccentOf, freeAccentOf, isBenched } from '@shobu/core'
import type { RoomSimulation } from './roomSimulation.ts'

/**
 * O neon de quem acabou de entrar: o menor acento que nenhum outro humano usa
 * (`freeAccentOf`). A sala decide, e não cada cliente pela vaga local em que
 * o jogador caiu: assim todo mundo vê a mesma cor. Os bots não contam: são
 * eles que cedem a cor (`roomBotAccentsOf`).
 *
 * ```ts
 * seat.accent = freeSeatAccentOf(room, playerId)
 * ```
 */
export function freeSeatAccentOf(room: RoomSimulation, playerId: string): number {
  const taken: number[] = []
  for (const [id, seat] of room.seats) if (id !== playerId) taken.push(seat.accent)
  return freeAccentOf(taken)
}

/**
 * O neon de cada bot sentado, pelo índice no esquadrão (`botAccentOf`): longe
 * dos humanos, e repetindo entre bots antes de repetir um humano. O bot no
 * banco fica fora da conta e da lista.
 *
 * ```ts
 * const accents = roomBotAccentsOf(room)
 * out.accent = accents.get(botIndex) ?? 0
 * ```
 */
export function roomBotAccentsOf(room: RoomSimulation): ReadonlyMap<number, number> {
  const humans = [...room.seats.values()].map((seat) => seat.accent)
  const bots: number[] = []
  const byIndex = new Map<number, number>()
  room.bots.squad.bots.forEach((bot, botIndex) => {
    if (isBenched(bot)) return
    const accent = botAccentOf(humans, bots)
    bots.push(accent)
    byIndex.set(botIndex, accent)
  })
  return byIndex
}
