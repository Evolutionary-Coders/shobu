import { readFileSync } from 'node:fs'
import {
  ICHIBAN_GAI_LAYOUT,
  isBenched,
  killFighter,
  NEON_KAIDO_LAYOUT,
  parseGameplayConfig,
  type Vector3,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { respawnRoom, switchRoomArena } from './roomRestart.ts'
import {
  createRoomSimulation,
  joinRoom,
  type RoomRules,
  type RoomSimulation,
  roomRulesFor,
} from './roomSimulation.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const neon = roomRulesFor(NEON_KAIDO_LAYOUT, config)
const ichiban = roomRulesFor(ICHIBAN_GAI_LAYOUT, config)
const catalog = new Map<string, RoomRules>([
  [neon.arenaId, neon],
  [ichiban.arenaId, ichiban],
])

function roomWithAna(): RoomSimulation {
  const room = createRoomSimulation(neon, catalog)
  joinRoom(room, 'ana', 'katana', neon)
  return room
}

function isSpawnOf(rules: RoomRules, feetM: Readonly<Vector3>): boolean {
  return rules.spawnsFeetM.some((spawn) => Math.hypot(spawn.x - feetM.x, spawn.z - feetM.z) < 1e-6)
}

describe('switchRoomArena', () => {
  /** O índice do bot na lista é a identidade dele para `aimAndTrigger`. */
  it('troca os bots pelos do mapa novo, com os mesmos ids, na frente da lista', () => {
    const room = roomWithAna()
    const oldBots = room.bots
    const ids = room.bots.squad.bots.map((bot) => bot.id)
    switchRoomArena(room, ichiban)
    expect(room.bots).not.toBe(oldBots)
    expect(room.bots.squad.arena.spawnsFeetM).toBe(ichiban.spawnsFeetM)
    expect(room.fighters.map((fighter) => fighter.id)).toEqual([...ids, 'ana'])
    expect(room.fighters.slice(0, ids.length)).toEqual(room.bots.squad.bots)
    expect(room.rules).toBe(ichiban)
  })

  it('o placar e as séries continuam valendo para os bots novos', () => {
    const room = roomWithAna()
    switchRoomArena(room, ichiban)
    for (const bot of room.bots.squad.bots) {
      expect(room.board.players.has(bot.id)).toBe(true)
      expect(room.scorestreaks.ledger.slotsById.has(bot.id)).toBe(true)
    }
  })
})

describe('respawnRoom', () => {
  it('põe cada humano vivo num spawn do mapa novo, com a contagem da borda zerada', () => {
    const room = roomWithAna()
    const ana = room.seats.get('ana')
    if (!ana) throw new Error('ana fora da sala')
    killFighter(ana.fighter, config.match.respawnDelayS)
    ana.boundaryDeaths = 3
    switchRoomArena(room, ichiban)
    respawnRoom(room, ichiban)
    expect(ana.fighter).toMatchObject({ alive: true, respawnLeftS: 0 })
    expect(ana.boundaryDeaths).toBe(0)
    expect(isSpawnOf(ichiban, ana.body.position)).toBe(true)
  })

  it('senta de novo os bots da conta de vagas, cada um num spawn do mapa', () => {
    const room = roomWithAna()
    switchRoomArena(room, ichiban)
    respawnRoom(room, ichiban)
    const seated = room.bots.squad.bots.filter((bot) => !isBenched(bot))
    expect(seated).toHaveLength(config.match.playersPerRoom - 1)
    for (const bot of seated) {
      expect(bot.alive).toBe(true)
      expect(bot.mind.targetIndex).toBe(-1)
      expect(isSpawnOf(ichiban, bot.body.position)).toBe(true)
    }
  })
})
