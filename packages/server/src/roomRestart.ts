import { forgetFighters, seatBots } from '@shobu/core'
import { createRoomBots, seatRoomBots } from './roomBots.ts'
import { respawnSeat } from './roomSeat.ts'
import { type RoomRules, type RoomSimulation, spawnFor } from './roomSimulation.ts'

/**
 * A virada de mapa da sala (ADR 0031): os bots são outros, porque guardam a
 * colisão, o grafo e os spawns do mapa desde que nascem, e as regras passam a
 * ser as do mapa novo. Os bots novos têm os mesmos ids — mesma semente, mesmas
 * vagas —, e o placar e as séries continuam valendo para eles. Ficam na
 * frente da lista de lutadores, como na criação: a posição é como o bot se
 * reconhece (`aimAndTrigger`). Quem põe cada um no mapa é `respawnRoom`.
 *
 * ```ts
 * switchRoomArena(room, room.arenas.get('ichiban-gai'))
 * respawnRoom(room, room.rules)
 * ```
 */
export function switchRoomArena(room: RoomSimulation, nextRules: RoomRules): void {
  room.fighters.splice(0, room.bots.squad.bots.length)
  const bots = createRoomBots(nextRules, room.fighters)
  room.fighters.unshift(...bots.squad.bots)
  room.bots = bots
  room.rules = nextRules
}

/**
 * Todo mundo vivo, num spawn, com a arma cheia: o começo da partida seguinte.
 * Os bots sentados voltam ao banco e sentam de novo, que é o que os põe num
 * spawn sorteado; nenhum guarda o alvo da partida anterior.
 *
 * ```ts
 * respawnRoom(room, room.rules)
 * ```
 */
export function respawnRoom(room: RoomSimulation, rules: RoomRules): void {
  for (const seat of room.seats.values()) {
    respawnSeat(seat, spawnFor(room, rules), rules)
    seat.fighter.alive = true
    seat.fighter.respawnLeftS = 0
    seat.boundaryDeaths = 0
  }
  seatBots(room.bots.squad, room.fighters, 0, rules.config)
  for (const bot of room.bots.squad.bots) forgetFighters(bot.mind)
  seatRoomBots(room, rules)
}
