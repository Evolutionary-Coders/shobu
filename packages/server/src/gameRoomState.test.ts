import { readFileSync } from 'node:fs'
import { Encoder } from '@colyseus/schema'
import {
  decodeMovementInput,
  GREYBOX_SPAWN_POINTS_M,
  parseGameplayConfig,
  quantizePositionM,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { GameRoomState, PlayerInput, PlayerState } from './gameRoomState.ts'
import { createRoomSimulation, joinRoom, writeRoomState } from './roomSimulation.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

describe('PlayerState', () => {
  /** O snapshot do jogador é o que `writeRoomState` escreve: nenhum campo pode sumir no caminho. */
  it('guarda o que writeRoomState escreve, nos limites de int16', () => {
    const room = createRoomSimulation(config)
    const player = joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
    player.character.position.x = -32.767
    const state = new PlayerState()

    writeRoomState(room, () => state)

    expect(state.x).toBe(quantizePositionM(-32.767))
    expect(state.x).toBe(-32767)
    expect(state.aimZ).toBe(-32767)
    expect(state.alive).toBe(true)
  })

  it('codifica um estado com jogador sem erro de tipo no schema', () => {
    const room = createRoomSimulation(config)
    joinRoom(room, 'ana', GREYBOX_SPAWN_POINTS_M, config)
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
    expect(decodeMovementInput(input, false)).toMatchObject({ wishX: 1, wishZ: -1 })
  })
})
