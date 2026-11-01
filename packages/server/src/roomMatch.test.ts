import { readFileSync } from 'node:fs'
import { NEON_KAIDO_LAYOUT, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { FakeRoomIo } from './roomIoFake.ts'
import { createRoomMatch, roomScores, stepRoomMatch } from './roomMatch.ts'
import {
  createRoomSimulation,
  joinRoom,
  type RoomSimulation,
  roomRulesFor,
} from './roomSimulation.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const rules = roomRulesFor(NEON_KAIDO_LAYOUT, config)
const TICK_S = 1 / config.simulation.tickHz

function roomWithAna(): { room: RoomSimulation; io: FakeRoomIo } {
  const room = createRoomSimulation(rules)
  joinRoom(room, 'ana', 'katana', rules)
  return { room, io: new FakeRoomIo(room) }
}

/** Anda ticks até a primeira borda, como a sala faria. */
function tickUntilEdge(room: RoomSimulation, io: FakeRoomIo): void {
  const edges = io.matchEdges.length
  for (let tick = 0; tick < 100_000 && io.matchEdges.length === edges; tick += 1) {
    stepRoomMatch(room, io, rules)
  }
}

describe('createRoomMatch', () => {
  it('abre a sala no aquecimento, com relógio, na partida zero', () => {
    const match = createRoomMatch(config.match)
    expect(match.cycle).toMatchObject({ phase: 'warmup', phaseS: 0, timed: true })
    expect(match.serial).toBe(0)
  })
})

describe('stepRoomMatch', () => {
  it('anda um tick de relógio por chamada e avisa a borda do aquecimento', () => {
    const { room, io } = roomWithAna()
    expect(stepRoomMatch(room, io, rules)).toBeUndefined()
    expect(room.match.cycle.phaseS).toBeCloseTo(TICK_S, 9)
    tickUntilEdge(room, io)
    expect(io.matchEdges).toEqual(['live'])
    expect(room.match.cycle.phase).toBe('live')
  })

  /** O limite de pontos lê o placar do servidor, e não o de nenhum cliente. */
  it('acaba a partida quando o líder chega ao limite de pontos', () => {
    const { room, io } = roomWithAna()
    room.match.cycle.phase = 'live'
    const ana = room.board.players.get('ana')
    if (ana) ana.points = config.match.scoreLimitPoints
    expect(stepRoomMatch(room, io, rules)).toBe('over')
  })

  it('no fim pelo relógio, manda o resumo do placar oficial a todos, do MVP ao último', () => {
    const { room, io } = roomWithAna()
    Object.assign(room.match.cycle, { phase: 'live', phaseS: config.match.durationS })
    const ana = room.board.players.get('ana')
    if (ana) ana.points = 100
    expect(stepRoomMatch(room, io, rules)).toBe('over')
    expect(io.summaries).toHaveLength(1)
    expect(io.summaries[0]?.reason).toBe('time')
    expect(io.summaries[0]?.rows[0]?.playerId).toBe('ana')
    expect(room.match.summary).toBe(io.summaries[0]?.rows)
  })

  it('no fim pelo limite de pontos, o porquê é o placar', () => {
    const { room, io } = roomWithAna()
    room.match.cycle.phase = 'live'
    const ana = room.board.players.get('ana')
    if (ana) ana.points = config.match.scoreLimitPoints
    stepRoomMatch(room, io, rules)
    expect(io.summaries[0]?.reason).toBe('score')
  })

  /** A arena congelou: o pedido que esperava o tick não aciona série nenhuma. */
  it('no fim, o pedido de série que ainda esperava o tick se perde', () => {
    const { room, io } = roomWithAna()
    Object.assign(room.match.cycle, { phase: 'live', phaseS: config.match.durationS })
    room.scorestreaks.pending.set('ana', 0)
    stepRoomMatch(room, io, rules)
    expect(room.scorestreaks.pending.size).toBe(0)
  })

  /** O buraco da ADR 0029: a série pronta passava para a partida seguinte. */
  it('na partida seguinte zera o placar, as séries e os pedidos, e volta ao aquecimento', () => {
    const { room, io } = roomWithAna()
    const ana = room.board.players.get('ana')
    if (ana) ana.points = 900
    const slots = room.scorestreaks.ledger.slotsById.get('ana')
    if (slots) slots.ready[0] = true
    room.scorestreaks.pending.set('ana', 0)
    Object.assign(room.match.cycle, { phase: 'decided', phaseS: config.match.decidedHoldS })
    const timeBefore = room.matchTimeS

    expect(stepRoomMatch(room, io, rules)).toBe('next')

    expect(ana?.points).toBe(0)
    expect(slots?.ready[0]).toBe(false)
    expect(room.scorestreaks.pending.size).toBe(0)
    expect(room.match.serial).toBe(1)
    expect(room.match.summary).toBeUndefined()
    expect(room.match.cycle).toMatchObject({ phase: 'warmup', phaseS: 0, restartDue: false })
    // o relógio da sala só cresce: é o instante das kills.
    expect(room.matchTimeS).toBe(timeBefore)
  })
})

describe('roomScores', () => {
  it.each([
    ['warmup', false],
    ['live', true],
    ['over', false],
  ] as const)('em %s, pontua: %s', (phase, scores) => {
    const match = createRoomMatch(config.match)
    match.cycle.phase = phase
    expect(roomScores({ match })).toBe(scores)
  })
})
