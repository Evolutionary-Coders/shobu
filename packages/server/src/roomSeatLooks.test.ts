import { readFileSync } from 'node:fs'
import { NEON_KAIDO_LAYOUT, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { freeSeatAccentOf } from './roomSeatLooks.ts'
import { createRoomSimulation, joinRoom, leaveRoom, roomRulesFor } from './roomSimulation.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const open = roomRulesFor(NEON_KAIDO_LAYOUT, config)

describe('freeSeatAccentOf', () => {
  it('dá a dois jogadores acentos diferentes', () => {
    const room = createRoomSimulation(open)
    const ana = joinRoom(room, 'ana', 'katana', open)
    const bia = joinRoom(room, 'bia', 'katana', open)
    expect(ana.accent).not.toBe(bia.accent)
  })

  it('mantém o acento de quem já estava quando um terceiro entra', () => {
    const room = createRoomSimulation(open)
    const ana = joinRoom(room, 'ana', 'katana', open)
    const bia = joinRoom(room, 'bia', 'katana', open)
    const before = [ana.accent, bia.accent]
    const caio = joinRoom(room, 'caio', 'katana', open)
    expect([ana.accent, bia.accent]).toEqual(before)
    expect(before).not.toContain(caio.accent)
  })

  it('não conta o próprio assento como cor tomada', () => {
    const room = createRoomSimulation(open)
    joinRoom(room, 'ana', 'katana', open)
    const bia = joinRoom(room, 'bia', 'katana', open)
    expect(freeSeatAccentOf(room, 'bia')).toBe(bia.accent)
  })

  it('devolve a cor de quem saiu para quem entra', () => {
    const room = createRoomSimulation(open)
    joinRoom(room, 'ana', 'katana', open)
    const bia = joinRoom(room, 'bia', 'katana', open)
    leaveRoom(room, 'bia', open)
    expect(joinRoom(room, 'caio', 'katana', open).accent).toBe(bia.accent)
  })
})
