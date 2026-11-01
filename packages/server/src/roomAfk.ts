import type { WireInput } from '@shobu/core'
import type { RoomSeat } from './roomSeat.ts'
import type { RoomIo, RoomSimulation } from './roomSimulation.ts'

/**
 * A inatividade (ADR 0031): quem fica parado `afkWarnS` com a partida valendo
 * recebe o aviso, e em `afkKickS` sai da sala, para a vaga ir a quem espera na
 * fila. Só conta em `live`: parado no aquecimento ou no intervalo ninguém
 * joga, e a contagem recomeça na entrada da partida (`forgiveIdleSeats`).
 *
 * Uma aba escondida não manda input nenhum, e conta como parada — é o caso
 * que a regra existe para pegar. Quem recarrega a página para o mapa novo
 * (`away`) fica fora da conta.
 */

/**
 * Anota o input do tick: o que mexe em alguma coisa — andar, um botão, ou a
 * mira — renova a atividade e apaga o aviso. O input todo parado, com a mesma
 * mira de antes, não conta: é o cliente mandando o tick de quem saiu de perto.
 * Chamado **antes** de a mira do assento ser trocada pela deste input.
 *
 * ```ts
 * noteSeatInput(seat, wire, room.matchTimeS)
 * seat.aim = { aimX: wire.aimX, aimY: wire.aimY, aimZ: wire.aimZ }
 * ```
 */
export function noteSeatInput(seat: RoomSeat, wire: Readonly<WireInput>, nowS: number): void {
  if (isIdleInput(seat, wire)) return
  seat.activeAtS = nowS
  seat.idleNotice = 'active'
}

function isIdleInput(seat: Readonly<RoomSeat>, wire: Readonly<WireInput>): boolean {
  if (wire.wishX !== 0 || wire.wishZ !== 0 || wire.buttons !== 0) return false
  const { aim } = seat
  return wire.aimX === aim.aimX && wire.aimY === aim.aimY && wire.aimZ === aim.aimZ
}

/**
 * O passo da inatividade, uma vez por tick: o aviso em `afkWarnS` e a saída em
 * `afkKickS`, cada um uma vez. A saída é do adapter (`onAfkKick`), que fecha a
 * conexão; o assento só some quando o colyseus chama o `onLeave`.
 *
 * ```ts
 * stepRoomAfk(room, io) // no fim do `stepRoom`
 * ```
 */
export function stepRoomAfk(room: RoomSimulation, io: RoomIo): void {
  if (room.match.cycle.phase !== 'live') return
  for (const [playerId, seat] of room.seats) stepSeatAfk(room, playerId, seat, io)
}

function stepSeatAfk(room: RoomSimulation, playerId: string, seat: RoomSeat, io: RoomIo): void {
  if (seat.away || seat.idleNotice === 'kicked') return
  const { afkWarnS, afkKickS } = room.match.config
  const idleS = room.matchTimeS - seat.activeAtS
  if (idleS >= afkKickS) {
    seat.idleNotice = 'kicked'
    io.onAfkKick(playerId)
    return
  }
  if (idleS < afkWarnS || seat.idleNotice === 'warned') return
  seat.idleNotice = 'warned'
  io.onAfkWarning(playerId, Math.ceil(afkKickS - idleS))
}

/**
 * A partida começou, ou o jogador voltou da recarga: a inatividade conta de
 * agora. Sem isto, quem esperou o intervalo inteiro sem mexer — o que é o
 * normal, olhando o pódio — entraria na partida já perto do aviso.
 *
 * ```ts
 * forgiveIdleSeats(room) // na borda `live`
 * ```
 */
export function forgiveIdleSeats(room: RoomSimulation): void {
  for (const seat of room.seats.values()) forgiveIdleSeat(seat, room.matchTimeS)
}

/** Um assento só: a inatividade conta de `nowS`, e o aviso volta a valer. */
export function forgiveIdleSeat(seat: RoomSeat, nowS: number): void {
  seat.activeAtS = nowS
  seat.idleNotice = 'active'
}
