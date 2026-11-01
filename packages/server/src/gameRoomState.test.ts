import { readFileSync } from 'node:fs'
import { Encoder } from '@colyseus/schema'
import {
  decodeMovementInput,
  encodeMatchPhase,
  IDLE_INPUT,
  NEON_KAIDO_LAYOUT,
  parseGameplayConfig,
  quantizePositionM,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { GameRoomState, MatchState, PlayerInput, PlayerState } from './gameRoomState.ts'
import { FakeRoomStateSink } from './roomIoFake.ts'
import { createRoomSimulation, joinRoom, roomRulesFor } from './roomSimulation.ts'
import { writeRoomState } from './roomState.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const rules = roomRulesFor(NEON_KAIDO_LAYOUT, config)

describe('PlayerState', () => {
  /** O snapshot do jogador é o que `writeRoomState` escreve: nenhum campo pode sumir no caminho. */
  it('guarda o que writeRoomState escreve, nos limites de int16', () => {
    const room = createRoomSimulation(rules)
    const player = joinRoom(room, 'ana', 'knife', rules)
    player.body.position.x = -65.534
    player.primaryWeapon = 'classic'
    const state = new PlayerState()

    writeRoomState(room, {
      ...new FakeRoomStateSink(),
      stateOf: (id) => (id === 'ana' ? state : undefined),
    })

    expect(state.x).toBe(quantizePositionM(-65.534))
    expect(state.x).toBe(-32767)
    expect(state.aimZ).toBe(-32767)
    expect(state.alive).toBe(true)
    expect(state.primary).toBe(1)
  })

  /** O placar oficial vai no estado (ADR 0031): o uint32 dos pontos não pode cortar. */
  it('guarda o placar oficial nas larguras do schema', () => {
    const room = createRoomSimulation(rules)
    joinRoom(room, 'ana', 'knife', rules)
    Object.assign(room.board.players.get('ana') ?? {}, { points: 70_000, kills: 12, deaths: 3 })
    const roomState = new GameRoomState()
    roomState.players.set('ana', new PlayerState())
    writeRoomState(room, {
      matchState: () => roomState.match,
      stateOf: (id) => roomState.players.get(id),
      drop: (id) => roomState.players.delete(id),
    })
    expect(roomState.players.get('ana')).toMatchObject({ points: 70_000, kills: 12, deaths: 3 })
    expect(new Encoder(roomState).encodeAll().byteLength).toBeGreaterThan(0)
  })

  it('codifica um estado com jogador sem erro de tipo no schema', () => {
    const room = createRoomSimulation(rules)
    joinRoom(room, 'ana', 'knife', rules)
    const roomState = new GameRoomState()
    roomState.players.set('ana', new PlayerState())
    writeRoomState(room, {
      matchState: () => roomState.match,
      stateOf: (id) => roomState.players.get(id),
      drop: (id) => roomState.players.delete(id),
    })
    expect(new Encoder(roomState).encodeAll().byteLength).toBeGreaterThan(0)
  })
})

describe('MatchState', () => {
  /** Quem entra no meio lê a fase, o tempo e o mapa no primeiro patch. */
  it('guarda a fase, o que falta nela e o mapa que writeRoomState escreve', () => {
    const room = createRoomSimulation(rules)
    const roomState = new GameRoomState()
    writeRoomState(room, {
      matchState: () => roomState.match,
      stateOf: (id) => roomState.players.get(id),
      drop: (id) => roomState.players.delete(id),
    })
    expect(roomState.match).toBeInstanceOf(MatchState)
    expect(roomState.match.phase).toBe(encodeMatchPhase('warmup'))
    expect(roomState.match.phaseLeftDs).toBe(config.match.warmupS * 10)
    expect(roomState.match.arenaId).toBe(NEON_KAIDO_LAYOUT.id)
    expect(new Encoder(roomState).encodeAll().byteLength).toBeGreaterThan(0)
  })

  /** O voto vai no estado: os votos à vista, o que venceu (int8, -1 aberto) e o mapa seguinte. */
  it('guarda os votos, o vencedor e o mapa seguinte, e codifica', () => {
    const roomState = new GameRoomState()
    roomState.match.ballots.set('ana', 2)
    roomState.match.winner = -1
    roomState.match.nextArenaId = 'ichiban-gai'
    expect(roomState.match.ballots.get('ana')).toBe(2)
    expect(roomState.match.winner).toBe(-1)
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
