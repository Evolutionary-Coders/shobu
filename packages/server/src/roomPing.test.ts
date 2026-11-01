import { readFileSync } from 'node:fs'
import { NEON_KAIDO_LAYOUT, PING_MS_MAX, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { notePing } from './roomPing.ts'
import { createRoomSimulation, joinRoom, roomRulesFor } from './roomSimulation.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const rules = roomRulesFor(NEON_KAIDO_LAYOUT, config)

function roomWithAna() {
  const room = createRoomSimulation(rules)
  joinRoom(room, 'ana', 'katana', rules)
  return room
}

describe('notePing', () => {
  it('anota o rtt arredondado no assento', () => {
    const room = roomWithAna()
    expect(notePing(room, 'ana', 41.6)).toBe(true)
    expect(room.seats.get('ana')?.pingMs).toBe(42)
  })

  it('prende o relato entre zero e o teto', () => {
    const room = roomWithAna()
    notePing(room, 'ana', -5)
    expect(room.seats.get('ana')?.pingMs).toBe(0)
    notePing(room, 'ana', 1e9)
    expect(room.seats.get('ana')?.pingMs).toBe(PING_MS_MAX)
  })

  it.each<unknown>([Number.NaN, Number.POSITIVE_INFINITY, '42', undefined])(
    'recusa o que não é número finito: %s',
    (raw) => {
      const room = roomWithAna()
      expect(notePing(room, 'ana', raw)).toBe(false)
      expect(room.seats.get('ana')?.pingMs).toBe(0)
    },
  )

  it('recusa quem não tem assento', () => {
    expect(notePing(roomWithAna(), 'bia', 42)).toBe(false)
  })
})
