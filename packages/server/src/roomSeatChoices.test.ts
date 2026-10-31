import { readFileSync } from 'node:fs'
import {
  DEFAULT_PROFILE_NAME,
  encodePrimaryWeapon,
  NEON_KAIDO_LAYOUT,
  parseGameplayConfig,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { FakeRoomStateSink } from './roomIoFake.ts'
import type { RoomSeat } from './roomSeat.ts'
import { chooseMelee, choosePrimary, nameSeat } from './roomSeatChoices.ts'
import {
  createRoomSimulation,
  joinRoom,
  type RoomSimulation,
  roomRulesFor,
} from './roomSimulation.ts'
import { writeRoomState } from './roomState.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const open = roomRulesFor(NEON_KAIDO_LAYOUT, config)

function seat(room: RoomSimulation, playerId: string): RoomSeat {
  const found = room.seats.get(playerId)
  if (!found) throw new Error(`'${playerId}' fora da sala`)
  return found
}

describe('nameSeat', () => {
  it('põe no estado o nome que o cliente mandou, limpo como o menu limpa', () => {
    const room = createRoomSimulation(open)
    joinRoom(room, 'ana', 'knife', open)
    nameSeat(room, 'ana', ' raiden<x> ')
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    expect(sink.states.get('ana')?.name).toBe('RAIDENX')
  })

  /** Vem da rede: o que não é nome vira o padrão, e ninguém de fora da sala muda. */
  it.each([42, '  <> ', undefined])('com %j, fica o nome padrão', (callsign) => {
    const room = createRoomSimulation(open)
    joinRoom(room, 'ana', 'knife', open)
    nameSeat(room, 'ana', 'raiden')
    nameSeat(room, 'ana', callsign)
    nameSeat(room, 'ninguém', 'kitsu')
    expect(seat(room, 'ana').callsign).toBe(DEFAULT_PROFILE_NAME)
  })
})

describe('chooseMelee', () => {
  it('troca a lâmina pela que o cliente escolheu', () => {
    const room = createRoomSimulation(open)
    joinRoom(room, 'ana', 'knife', open)
    chooseMelee(room, 'ana', 'katana')
    expect(seat(room, 'ana').arsenal.melee.weapon).toBe('katana')
  })

  /** Regressão: a troca zerava as recargas, e reenviar a classe dava golpe sem recarga. */
  it('mantém as recargas de golpe e de investida', () => {
    const room = createRoomSimulation(open)
    const { melee } = joinRoom(room, 'ana', 'knife', open).arsenal
    Object.assign(melee, { cooldownLeftS: 0.4, dashCooldownLeftS: 1.2 })
    chooseMelee(room, 'ana', 'katana')
    expect(melee).toMatchObject({ cooldownLeftS: 0.4, dashCooldownLeftS: 1.2 })
  })

  /** Vem da rede: uma lâmina que o jogo não tem não entra, e ninguém de fora da sala muda. */
  it.each(['machado', undefined, 3])('ignora %j', (weapon) => {
    const room = createRoomSimulation(open)
    joinRoom(room, 'ana', 'knife', open)
    chooseMelee(room, 'ana', weapon)
    chooseMelee(room, 'ninguém', 'katana')
    expect(seat(room, 'ana').arsenal.melee.weapon).toBe('knife')
  })
})

describe('choosePrimary', () => {
  it('entra com a laser, a arma padrão', () => {
    const room = createRoomSimulation(open)
    expect(joinRoom(room, 'ana', 'knife', open).primaryWeapon).toBe('laser')
  })

  it('põe no estado a arma que o cliente escolheu', () => {
    const room = createRoomSimulation(open)
    joinRoom(room, 'ana', 'knife', open)
    choosePrimary(room, 'ana', 'classic')
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    expect(seat(room, 'ana').primaryWeapon).toBe('classic')
    expect(sink.states.get('ana')?.primary).toBe(encodePrimaryWeapon('classic'))
  })

  /** Regressão do padrão de `chooseMelee`: reenviar a classe não pode zerar a arma. */
  it('mantém o estado da arma', () => {
    const room = createRoomSimulation(open)
    const { weapon } = joinRoom(room, 'ana', 'knife', open).arsenal
    const before = { ...weapon }
    choosePrimary(room, 'ana', 'classic')
    expect(weapon).toEqual(before)
  })

  /** Vem da rede: uma arma que o jogo não tem não entra, e ninguém de fora da sala muda. */
  it.each(['rocket', undefined, 1])('ignora %j', (weapon) => {
    const room = createRoomSimulation(open)
    joinRoom(room, 'ana', 'knife', open)
    choosePrimary(room, 'ana', weapon)
    choosePrimary(room, 'ninguém', 'classic')
    expect(seat(room, 'ana').primaryWeapon).toBe('laser')
  })
})
