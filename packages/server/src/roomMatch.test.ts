import { readFileSync } from 'node:fs'
import {
  ICHIBAN_GAI_LAYOUT,
  killFighter,
  NEON_KAIDO_LAYOUT,
  parseGameplayConfig,
  SEAT_RESERVATION_S,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { FakeRoomIo } from './roomIoFake.ts'
import {
  createRoomMatch,
  holdSeatForReload,
  reloadHoldS,
  roomAwaitsReload,
  roomScores,
  seatReturned,
  stepRoomMatch,
  summaryForJoiner,
} from './roomMatch.ts'
import {
  createRoomSimulation,
  joinRoom,
  type RoomRules,
  type RoomSimulation,
  roomRulesFor,
  stepRoom,
} from './roomSimulation.ts'
import { closeRoomVote, openRoomVote } from './roomVote.ts'

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

  it('na tela de resultado abre o voto, e no fim dela o fecha', () => {
    const { room, io } = roomWithAna()
    Object.assign(room.match.cycle, { phase: 'over', phaseS: config.match.overHoldS })
    expect(stepRoomMatch(room, io, rules)).toBe('results')
    expect(room.match.vote?.options).toEqual(['neon-kaido', 'random'])
    room.match.cycle.phaseS = config.match.resultsS
    expect(stepRoomMatch(room, io, rules)).toBe('decided')
    expect(room.match.vote?.outcome?.mapId).toBe('neon-kaido')
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
    expect(room.match.vote).toBeUndefined()
    expect(room.match.cycle).toMatchObject({ phase: 'warmup', phaseS: 0, restartDue: false })
    // o relógio da sala só cresce: é o instante das kills.
    expect(room.matchTimeS).toBe(timeBefore)
  })
})

describe('a partida seguinte', () => {
  const ichiban = roomRulesFor(ICHIBAN_GAI_LAYOUT, config)
  const catalog = new Map<string, RoomRules>([
    [rules.arenaId, rules],
    [ichiban.arenaId, ichiban],
  ])

  /** Ana na tela de resultado de Neon Kaido, com o voto dela fechado em `mapId`. */
  function decidedFor(mapId: string): { room: RoomSimulation; io: FakeRoomIo } {
    const room = createRoomSimulation(rules, catalog)
    joinRoom(room, 'ana', 'katana', rules)
    room.match.cycle.phase = 'results'
    const vote = openRoomVote(room)
    vote.ballots = [{ voterId: 'ana', optionId: mapId, atS: 1 }]
    room.match.vote = vote
    closeRoomVote(room)
    Object.assign(room.match.cycle, { phase: 'decided', phaseS: config.match.decidedHoldS })
    return { room, io: new FakeRoomIo(room) }
  }

  it('vai para o mapa que o voto escolheu, para todos', () => {
    const { room, io } = decidedFor('ichiban-gai')
    expect(stepRoomMatch(room, io, rules)).toBe('next')
    expect(room.rules).toBe(ichiban)
    expect(io.nextMatches).toEqual(['ichiban-gai:trocou'])
  })

  it('fica no mesmo mapa quando o voto o escolhe de novo', () => {
    const { room, io } = decidedFor('neon-kaido')
    const bots = room.bots
    stepRoomMatch(room, io, rules)
    expect(room.rules).toBe(rules)
    expect(room.bots).toBe(bots)
    expect(io.nextMatches).toEqual(['neon-kaido'])
  })

  it('põe de volta no spawn quem estava morto quando a partida acabou', () => {
    const { room, io } = decidedFor('neon-kaido')
    const ana = room.seats.get('ana')
    if (ana) killFighter(ana.fighter, config.match.respawnDelayS)
    stepRoomMatch(room, io, rules)
    expect(ana?.fighter.alive).toBe(true)
  })

  /** A página recarrega no mapa novo: a vaga espera a volta, no aquecimento. */
  it('com o mapa trocado, a vaga de quem cai espera a recarga até a reserva vencer', () => {
    const { room, io } = decidedFor('ichiban-gai')
    stepRoomMatch(room, io, rules)
    expect(roomAwaitsReload(room)).toBe(true)
    expect(holdSeatForReload(room, 'ana')).toBe(true)
    expect(room.seats.get('ana')?.away).toBe(true)
    seatReturned(room, 'ana')
    expect(room.seats.get('ana')?.away).toBe(false)
    room.matchTimeS += SEAT_RESERVATION_S
    expect(roomAwaitsReload(room)).toBe(false)
  })

  /**
   * A reserva (15 s) passa do aquecimento (12 s): o corpo parado de quem
   * recarrega, vivo, era kill de graça para o tiro, o golpe e os bots.
   */
  it('longe, o lutador fica fora de jogo até voltar, mesmo com a partida valendo', () => {
    const { room, io } = decidedFor('ichiban-gai')
    stepRoomMatch(room, io, rules)
    holdSeatForReload(room, 'ana')
    const ana = room.seats.get('ana')
    const ticks = Math.ceil((config.match.warmupS + config.match.respawnDelayS + 1) / TICK_S)
    for (let tick = 0; tick < ticks; tick += 1) stepRoom(room, io, room.rules)
    expect(room.match.cycle.phase).toBe('live')
    expect(ana?.fighter.alive).toBe(false)
    expect(io.kills.filter((kill) => kill.victimId === 'ana')).toEqual([])
    seatReturned(room, 'ana')
    expect(ana?.fighter.alive).toBe(true)
  })

  it('volta num spawn do mapa novo, e quem não estava longe não é reposto', () => {
    const { room, io } = decidedFor('ichiban-gai')
    stepRoomMatch(room, io, rules)
    const ana = room.seats.get('ana')
    const feet = { ...ana?.body.position }
    seatReturned(room, 'ana')
    expect(ana?.body.position).toEqual(feet)
    holdSeatForReload(room, 'ana')
    seatReturned(room, 'ana')
    const spawns = ichiban.spawnsFeetM.map((spawn) => ({ ...spawn }))
    expect(spawns).toContainEqual({ ...ana?.body.position })
  })

  /** A queda no fim do aquecimento não ganha mais 15 s com a vaga vazia na partida. */
  it('a vaga espera só o que falta da reserva aberta na troca', () => {
    const { room, io } = decidedFor('ichiban-gai')
    stepRoomMatch(room, io, rules)
    expect(reloadHoldS(room)).toBe(SEAT_RESERVATION_S)
    room.matchTimeS += SEAT_RESERVATION_S - 2
    expect(reloadHoldS(room)).toBeCloseTo(2)
    room.matchTimeS += 5
    expect(reloadHoldS(room)).toBe(0)
  })

  it('no mesmo mapa ninguém recarrega, e cair é sair', () => {
    const { room, io } = decidedFor('neon-kaido')
    stepRoomMatch(room, io, rules)
    expect(holdSeatForReload(room, 'ana')).toBe(false)
    expect(room.seats.get('ana')?.away).toBe(false)
  })

  it('a espera acaba com a partida valendo, e não guarda vaga de quem não está sentado', () => {
    const { room, io } = decidedFor('ichiban-gai')
    stepRoomMatch(room, io, rules)
    expect(holdSeatForReload(room, 'zé')).toBe(false)
    seatReturned(room, 'zé')
    room.match.cycle.phase = 'live'
    expect(roomAwaitsReload(room)).toBe(false)
  })

  /** As regras do tick eram as do mapa velho: o resto do tick fica para o próximo. */
  it('o tick da virada não anda mais ninguém', () => {
    const { room, io } = decidedFor('ichiban-gai')
    io.push('ana', { wishX: 0, wishZ: -127, buttons: 0, aimX: 0, aimY: 0, aimZ: -32767 })
    stepRoom(room, io, rules)
    expect(io.remaining('ana')).toBe(1)
  })
})

describe('summaryForJoiner', () => {
  /** Quem entra no intervalo vê a tela de MVP como quem estava lá. */
  it('no intervalo, é o resumo da partida que acabou', () => {
    const { room, io } = roomWithAna()
    Object.assign(room.match.cycle, { phase: 'live', phaseS: config.match.durationS })
    stepRoomMatch(room, io, rules)
    expect(summaryForJoiner(room)).toBe(room.match.summary)
    room.match.cycle.phase = 'results'
    expect(summaryForJoiner(room)).toBe(room.match.summary)
  })

  it('com a partida valendo, não há resumo a mandar', () => {
    const { room } = roomWithAna()
    room.match.cycle.phase = 'live'
    expect(summaryForJoiner(room)).toBeUndefined()
  })

  /** Quem entra depois do fim recebe o resumo de quem jogou, sem a linha dele. */
  it('quem entra na sala logo depois do fim recebe o resumo da partida que acabou', () => {
    const { room, io } = roomWithAna()
    Object.assign(room.match.cycle, { phase: 'live', phaseS: config.match.durationS })
    stepRoom(room, io, rules)
    expect(room.match.cycle.phase).toBe('over')
    joinRoom(room, 'bia', 'katana', rules)
    const rows = summaryForJoiner(room)
    expect(rows).toBe(io.summaries[0]?.rows)
    expect(rows?.map((row) => row.playerId)).not.toContain('bia')
  })

  /** O aquecimento da partida seguinte não manda o resumo velho a quem chega. */
  it('quem entra no aquecimento, da sala nova ou da partida seguinte, não recebe resumo', () => {
    const { room, io } = roomWithAna()
    joinRoom(room, 'bia', 'katana', rules)
    expect(summaryForJoiner(room)).toBeUndefined()
    Object.assign(room.match.cycle, { phase: 'live', phaseS: config.match.durationS })
    // over, results, decided, next: quatro bordas até o aquecimento seguinte.
    for (let edge = 0; edge < 4; edge += 1) tickUntilEdge(room, io)
    expect(room.match.cycle.phase).toBe('warmup')
    joinRoom(room, 'cid', 'katana', rules)
    expect(summaryForJoiner(room)).toBeUndefined()
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
