import { readFileSync } from 'node:fs'
import { Encoder } from '@colyseus/schema'
import {
  decodeMovementInput,
  IDLE_INPUT,
  NEON_KAIDO_LAYOUT,
  parseGameplayConfig,
  quantizePositionM,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { GameRoomState, PlayerInput, PlayerState } from './gameRoomState.ts'
import { createRoomSimulation, joinRoom, roomRulesFor, writeRoomState } from './roomSimulation.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const rules = roomRulesFor(NEON_KAIDO_LAYOUT, config)

describe('PlayerState', () => {
  /** O snapshot do jogador é o que `writeRoomState` escreve: nenhum campo pode sumir no caminho. */
  it('guarda o que writeRoomState escreve, nos limites de int16', () => {
    const room = createRoomSimulation(config)
    const player = joinRoom(room, 'ana', 'knife', rules)
    player.body.position.x = -32.767
    const state = new PlayerState()

    writeRoomState(room, () => state)

    expect(state.x).toBe(quantizePositionM(-32.767))
    expect(state.x).toBe(-32767)
    expect(state.aimZ).toBe(-32767)
    expect(state.alive).toBe(true)
  })

  it('codifica um estado com jogador sem erro de tipo no schema', () => {
    const room = createRoomSimulation(config)
    joinRoom(room, 'ana', 'knife', rules)
    const roomState = new GameRoomState()
    roomState.players.set('ana', new PlayerState())
    writeRoomState(room, (id) => roomState.players.get(id))
    expect(new Encoder(roomState).encodeAll().byteLength).toBeGreaterThan(0)
  })
})

describe('PlayerInput', () => {
  it('é lido como o WireInput do núcleo', () => {
    const input = new PlayerInput()
    input.wishX = 127
    input.wishZ = -127
    input.aimZ = -32767
    const movement = { ...IDLE_INPUT }
    decodeMovementInput(input, movement)
    expect(movement).toMatchObject({ wishX: 1, wishZ: -1 })
  })

  /** Dez teclas no fio: o `uint8` de antes cortava o gancho, a lâmina e a troca de arma. */
  it('guarda os dez bits de teclas', () => {
    const input = new PlayerInput()
    input.buttons = 0b11_1111_1111
    expect(input.buttons).toBe(1023)
  })
})
