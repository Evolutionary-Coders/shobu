import { readFileSync } from 'node:fs'
import { CloseCode } from '@colyseus/core'
import { AFK_CLOSE_CODE, NEON_KAIDO_LAYOUT, parseGameplayConfig, type WireInput } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { forgiveIdleSeats, stepRoomAfk } from './roomAfk.ts'
import { FakeRoomIo } from './roomIoFake.ts'
import { seatReturned, stepRoomMatch } from './roomMatch.ts'
import { FORWARD_AIM } from './roomSeat.ts'
import {
  createRoomSimulation,
  joinRoom,
  type RoomSimulation,
  roomRulesFor,
  stepRoom,
} from './roomSimulation.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const rules = roomRulesFor(NEON_KAIDO_LAYOUT, config)
const { afkWarnS, afkKickS } = config.match

/** O tick de quem largou o teclado: nada apertado, a mesma mira de sempre. */
const STILL: WireInput = { wishX: 0, wishZ: 0, buttons: 0, ...FORWARD_AIM }
const WALK: WireInput = { ...STILL, wishZ: -127 }

/** Ana na sala, com a partida valendo desde agora. */
function liveRoomWithAna(): { room: RoomSimulation; io: FakeRoomIo } {
  const room = createRoomSimulation(rules)
  joinRoom(room, 'ana', 'katana', rules)
  room.match.cycle.phase = 'live'
  return { room, io: new FakeRoomIo(room) }
}

/** O relógio da sala pula para `idleS` depois da última atividade de Ana. */
function idleFor(room: RoomSimulation, idleS: number): void {
  room.matchTimeS = (room.seats.get('ana')?.activeAtS ?? 0) + idleS
}

describe('stepRoomAfk', () => {
  it('avisa uma vez em afkWarnS, com os segundos até a saída', () => {
    const { room, io } = liveRoomWithAna()
    idleFor(room, afkWarnS - 0.5)
    stepRoomAfk(room, io)
    expect(io.afkWarnings).toEqual([])
    idleFor(room, afkWarnS)
    stepRoomAfk(room, io)
    stepRoomAfk(room, io)
    expect(io.afkWarnings).toEqual([`ana:${afkKickS - afkWarnS}`])
  })

  it('tira da sala uma vez em afkKickS', () => {
    const { room, io } = liveRoomWithAna()
    idleFor(room, afkKickS)
    stepRoomAfk(room, io)
    stepRoomAfk(room, io)
    expect(io.afkKicks).toEqual(['ana'])
  })

  /** Parado no aquecimento ou no intervalo ninguém joga: não conta. */
  it.each(['warmup', 'over', 'results', 'decided'] as const)('em %s não conta', (phase) => {
    const { room, io } = liveRoomWithAna()
    room.match.cycle.phase = phase
    idleFor(room, afkKickS * 2)
    stepRoomAfk(room, io)
    expect([...io.afkWarnings, ...io.afkKicks]).toEqual([])
  })

  it('quem recarrega a página para o mapa novo fica fora da conta', () => {
    const { room, io } = liveRoomWithAna()
    const seat = room.seats.get('ana')
    if (seat) seat.away = true
    idleFor(room, afkKickS)
    stepRoomAfk(room, io)
    expect(io.afkKicks).toEqual([])
  })

  it('a inatividade conta da entrada, e não do zero da sala', () => {
    const room = createRoomSimulation(rules)
    room.match.cycle.phase = 'live'
    room.matchTimeS = afkKickS * 3
    joinRoom(room, 'ana', 'katana', rules)
    const io = new FakeRoomIo(room)
    stepRoomAfk(room, io)
    expect(io.afkWarnings).toEqual([])
  })
})

describe('noteSeatInput, pelo tick da sala', () => {
  it('andar renova a atividade e apaga o aviso', () => {
    const { room, io } = liveRoomWithAna()
    idleFor(room, afkWarnS)
    stepRoomAfk(room, io)
    io.push('ana', WALK)
    stepRoom(room, io, rules)
    expect(room.seats.get('ana')).toMatchObject({
      activeAtS: room.matchTimeS,
      idleNotice: 'active',
    })
  })

  it('mexer só a mira também conta', () => {
    const { room, io } = liveRoomWithAna()
    idleFor(room, afkWarnS)
    io.push('ana', { ...STILL, aimX: 1200 })
    stepRoom(room, io, rules)
    expect(room.seats.get('ana')?.activeAtS).toBe(room.matchTimeS)
  })

  /** A aba escondida, ou o cliente de quem saiu de perto: o tick chega, mas nada mudou. */
  it('o tick todo parado, com a mesma mira, não conta', () => {
    const { room, io } = liveRoomWithAna()
    idleFor(room, afkWarnS)
    const before = room.seats.get('ana')?.activeAtS
    io.push('ana', STILL)
    stepRoom(room, io, rules)
    expect(room.seats.get('ana')?.activeAtS).toBe(before)
    expect(io.afkWarnings).toHaveLength(1)
  })
})

describe('forgiveIdleSeats', () => {
  /** Quem olhou o pódio inteiro sem mexer não entra na partida já perto do aviso. */
  it('a entrada em live recomeça a conta de todo mundo', () => {
    const { room, io } = liveRoomWithAna()
    room.match.cycle.phase = 'warmup'
    room.match.cycle.phaseS = config.match.warmupS
    idleFor(room, afkKickS)
    expect(stepRoomMatch(room, io, rules)).toBe('live')
    stepRoomAfk(room, io)
    expect(io.afkKicks).toEqual([])
    expect(room.seats.get('ana')?.activeAtS).toBe(room.matchTimeS)
  })

  it('apaga o aviso dado', () => {
    const { room, io } = liveRoomWithAna()
    idleFor(room, afkWarnS)
    stepRoomAfk(room, io)
    forgiveIdleSeats(room)
    expect(room.seats.get('ana')?.idleNotice).toBe('active')
  })

  it('quem volta da recarga não volta inativo', () => {
    const { room } = liveRoomWithAna()
    const seat = room.seats.get('ana')
    if (seat) seat.away = true
    idleFor(room, afkKickS)
    seatReturned(room, 'ana')
    expect(seat).toMatchObject({ away: false, activeAtS: room.matchTimeS })
  })
})

describe('AFK_CLOSE_CODE', () => {
  /**
   * Regressão: era 4002, o `WITH_ERROR` do colyseus. A conexão velha que o
   * token da recarga derruba fechava com ele, e o log e o menu a contavam
   * como saída por inatividade.
   */
  it('fica fora dos códigos de fechamento do colyseus', () => {
    expect(Object.values(CloseCode)).not.toContain(AFK_CLOSE_CODE)
    expect(AFK_CLOSE_CODE).toBeGreaterThan(4010)
  })
})
