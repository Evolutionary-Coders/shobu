import { readFileSync } from 'node:fs'
import {
  createKillEvent,
  type KillEvent,
  NEON_KAIDO_LAYOUT,
  parseGameplayConfig,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { FakeRoomIo } from './roomIoFake.ts'
import { scoreRoomBoundaryDeath, scoreRoomKill } from './roomScoreboard.ts'
import {
  createRoomSimulation,
  joinRoom,
  leaveRoom,
  type RoomSimulation,
  roomRulesFor,
} from './roomSimulation.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const rules = roomRulesFor(NEON_KAIDO_LAYOUT, config)

function killOf(shooterId: string, victimId: string): KillEvent {
  return { ...createKillEvent(), shooterId, victimId }
}

function duel(): { room: RoomSimulation; io: FakeRoomIo } {
  const room = createRoomSimulation(rules)
  joinRoom(room, 'ana', 'katana', rules)
  joinRoom(room, 'bia', 'katana', rules)
  return { room, io: new FakeRoomIo(room) }
}

describe('o placar oficial da sala', () => {
  /** Eram dois: o das séries e o do tab de cada cliente (ADR 0031). */
  it('é um só: as séries não guardam placar próprio', () => {
    const { room } = duel()
    expect('board' in room.scorestreaks).toBe(false)
  })

  it('tem cada bot sentado e cada humano na ordem de entrada, e o bot no banco não', () => {
    const { room } = duel()
    expect([...room.board.players.keys()]).toEqual(['bot-0', 'bot-1', 'ana', 'bia'])
  })

  it('quem sai leva a linha dele', () => {
    const { room } = duel()
    leaveRoom(room, 'bia', rules)
    expect(room.board.players.has('bia')).toBe(false)
  })

  it('a kill pontua o atirador, conta a morte da vítima e vai para todos', () => {
    const { room, io } = duel()
    scoreRoomKill(room, io, killOf('ana', 'bia'), rules)
    expect(room.board.players.get('ana')).toMatchObject({ kills: 1 })
    expect(room.board.players.get('ana')?.points).toBeGreaterThanOrEqual(config.match.pointsPerKill)
    expect(room.board.players.get('bia')?.deaths).toBe(1)
    expect(io.killList()).toEqual(['ana>bia:sniper'])
  })

  it('a morte pela borda conta como morte, sem pontuar ninguém', () => {
    const { room, io } = duel()
    scoreRoomBoundaryDeath(room, io, 'ana')
    expect(room.board.players.get('ana')).toMatchObject({ deaths: 1, points: 0 })
    expect(io.boundaryDeaths).toEqual(['ana'])
  })
})
