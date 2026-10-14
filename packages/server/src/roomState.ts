import {
  type BotPlayer,
  type CharacterState,
  encodeStance,
  isBenched,
  lengthSquared,
  quantizeAim,
  quantizePositionM,
} from '@shobu/core'
import type { RoomSimulation } from './roomSimulation.ts'

/** Os campos que o `PlayerState` do schema tem; o schema os satisfaz por estrutura. */
export interface PlayerStateFields {
  x: number
  y: number
  z: number
  aimX: number
  aimY: number
  aimZ: number
  stance: number
  alive: boolean
  name: string
}

/** O estado da sala que o colyseus sincroniza, visto pela simulação. */
export interface RoomStateSink {
  /** O estado de um jogador da sala, criado na primeira vez que é pedido. */
  stateOf(playerId: string): PlayerStateFields | undefined
  /** Tira do estado quem não está mais na arena: o bot que foi para o banco. */
  drop(playerId: string): void
}

/**
 * Escreve o snapshot quantizado de cada jogador e de cada bot sentado no
 * estado que o colyseus sincroniza; o bot do banco sai do estado. Para o
 * cliente, os dois são iguais: um jogador da sala.
 *
 * ```ts
 * writeRoomState(room, { stateOf: (id) => players.get(id), drop: (id) => players.delete(id) })
 * ```
 */
export function writeRoomState(room: RoomSimulation, sink: RoomStateSink): void {
  for (const [playerId, { body, aim, fighter, callsign }] of room.seats) {
    const out = sink.stateOf(playerId)
    if (!out) continue
    writeBody(out, body, fighter.alive)
    writeName(out, callsign)
    out.aimX = aim.aimX
    out.aimY = aim.aimY
    out.aimZ = aim.aimZ
  }
  for (const bot of room.bots.squad.bots) writeBot(bot, sink)
}

/** O bot sentado como um jogador; o do banco, fora do estado. */
function writeBot(bot: BotPlayer, sink: RoomStateSink): void {
  if (isBenched(bot)) {
    sink.drop(bot.id)
    return
  }
  const out = sink.stateOf(bot.id)
  if (!out) return
  writeBody(out, bot.body, bot.alive)
  writeName(out, bot.callsign)
  // a mira de um bot que ainda não olhou para lado nenhum é zero, e zero não
  // tem direção: fica a do patch anterior.
  if (lengthSquared(bot.aimM) > 0) quantizeAim(bot.aimM, out)
}

/** Só quando muda: o nome muda quase nunca, e o tick escreve todo jogador. */
function writeName(out: PlayerStateFields, name: string): void {
  if (out.name !== name) out.name = name
}

function writeBody(out: PlayerStateFields, body: Readonly<CharacterState>, alive: boolean): void {
  out.x = quantizePositionM(body.position.x)
  out.y = quantizePositionM(body.position.y)
  out.z = quantizePositionM(body.position.z)
  out.stance = encodeStance(body.stance, body.grounded)
  out.alive = alive
}
