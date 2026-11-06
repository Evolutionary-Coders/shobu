import { stepRadarPulses } from '@shobu/core'
import { roomScores } from './roomMatch.ts'
import type { RoomIo, RoomSimulation } from './roomSimulation.ts'

/**
 * O radar da sala no fim do tick (ADR 0035): cada PING com varredura vencida
 * vê os inimigos vivos de agora e manda só para o dono. O PING do bot varre
 * igual, mas o bot não tem cliente e o cérebro dele não lê radar: a varredura
 * dele não sai daqui. Fora da partida valendo o radar não anda, e o PING que
 * sobrar acaba pelo relógio.
 *
 * ```ts
 * stepRoomRadar(room, io)
 * ```
 */
export function stepRoomRadar(room: RoomSimulation, io: RoomIo): void {
  if (!roomScores(room)) return
  const { radar, sweeps } = room.scorestreaks
  sweeps.length = 0
  stepRadarPulses(radar, room.matchTimeS, room.fighters, sweeps)
  for (const { ownerId, blips, pulseLeftS } of sweeps) {
    if (room.seats.has(ownerId)) io.onRadarSweep(ownerId, { blips, pulseLeftS })
  }
}
