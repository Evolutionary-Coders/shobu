import {
  addPlayer,
  createMatchCycle,
  type MatchCycle,
  type MatchPhase,
  type MatchSummaryRow,
  restartMatchCycle,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { config, mountSession } from '../controller/arenaSessionTestKit.ts'
import { createRoomIntermission, type RoomIntermission } from '../controller/roomIntermission.ts'
import { choiceOf } from './mapVoteBooth.ts'
import {
  createMatchEndDirector,
  type MatchEndDirector,
  type MatchEndEvent,
  type MatchEndRoom,
  stepMatchEnd,
} from './matchEndDirector.ts'

const ARENAS = [
  { id: 'neon-kaido', label: 'NEON-KAIDŌ' },
  { id: 'ichiban-gai', label: 'ICHIBAN-GAI' },
]
const { overHoldS, resultsS, decidedHoldS } = config.match

type TestRoom = MatchEndRoom & { cycle: MatchCycle; intermission: RoomIntermission }

/** A sala do kit de testes da sessão: o jogador e um bot, com o placar de verdade. */
function roomAt(phase: MatchPhase, online = false): TestRoom {
  const { session } = mountSession()
  addPlayer(session.scoreboard as never, 'bot-0').points = 400
  const cycle = createMatchCycle({ warmup: false, timed: true })
  cycle.phase = phase
  return {
    cycle,
    match: config.match,
    scoreboard: session.scoreboard,
    bots: session.bots,
    matchSeed: session.matchSeed,
    arenas: ARENAS,
    localId: 'local',
    online,
    intermission: createRoomIntermission(),
  }
}

/** Anda `seconds` em quadros de 60 Hz e devolve os eventos, na ordem. */
function run(director: MatchEndDirector, room: MatchEndRoom, seconds: number): MatchEndEvent[] {
  const events: MatchEndEvent[] = []
  for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
    const event = stepMatchEnd(director, room, 1 / 60, [])
    if (event) events.push(event)
  }
  return events
}

function summaryRow(playerId: string, points: number): MatchSummaryRow {
  return { playerId, points, kills: 0, deaths: 0, kd: 0, accuracy: 0, bestStreak: 0, medals: 0 }
}

describe('stepMatchEnd, offline', () => {
  it('com a partida correndo, nada acontece', () => {
    expect(run(createMatchEndDirector(ARENAS), roomAt('live'), 1)).toEqual([])
  })

  it('o fim inteiro: congela com o MVP, abre a tela, fecha o voto e pede a próxima', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('over')
    const events = run(director, room, overHoldS + resultsS + decidedHoldS + 0.5)
    expect(events.map((event) => event.kind)).toEqual(['over', 'results', 'decided', 'next'])
    expect(events[0]).toEqual({ kind: 'over', mvpId: 'bot-0' })
    const next = events[3]
    expect(next?.kind === 'next' && ARENAS.some((arena) => arena.id === next.mapId)).toBe(true)
  })

  it('a ordem final congela no fim: o placar que muda depois não muda o MVP', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('over')
    run(director, room, 0.1)
    addPlayer(room.scoreboard as never, 'local').points = 9_000
    expect(director.standings[0]?.playerId).toBe('bot-0')
  })

  it('os bots da sala votam; o banco não', () => {
    const director = createMatchEndDirector(ARENAS)
    run(director, roomAt('over'), 0.1)
    expect(director.booth.ballots.map((ballot) => ballot.voterId)).toEqual(['bot-0'])
  })

  it('o voto do jogador só vale com a tela de MVP aberta', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('over')
    stepMatchEnd(director, room, 1 / 60, [])
    stepMatchEnd(director, room, 1 / 60, [{ kind: 'vote', index: 1 }])
    expect(choiceOf(director.booth, 'local')).toBe(-1)
    run(director, room, overHoldS)
    expect(stepMatchEnd(director, room, 1 / 60, [{ kind: 'vote', index: 1 }])).toBeUndefined()
    expect(choiceOf(director.booth, 'local')).toBe(1)
  })

  it('o voto do jogador junto com o do bot decide sem sorteio', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('over')
    run(director, room, overHoldS + 0.1)
    const botChoice = director.booth.ballots[0]?.optionId
    const index = director.booth.choices.findIndex((choice) => choice.id === botChoice)
    stepMatchEnd(director, room, 1 / 60, [{ kind: 'vote', index }])
    run(director, room, resultsS)
    expect(director.outcome).toMatchObject({ optionId: botChoice, tied: false })
  })

  it('pedir o menu na tela de MVP é o evento de sair', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('over')
    run(director, room, overHoldS + 0.1)
    expect(stepMatchEnd(director, room, 1 / 60, [{ kind: 'leave' }])).toEqual({ kind: 'leave' })
  })

  it('a partida seguinte volta a jogar e limpa o resultado', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('over')
    run(director, room, overHoldS + resultsS + 0.5)
    expect(director.outcome).toBeDefined()
    restartMatchCycle(room.cycle, false)
    expect(stepMatchEnd(director, room, 1 / 60, [])).toEqual({ kind: 'playing' })
    expect(director.outcome).toBeUndefined()
  })
})

describe('stepMatchEnd, online', () => {
  /** Quem entra no intervalo não viu o fim: a tela monta na ordem, uma fase por quadro. */
  it('quem entra na tela de resultado vê o fim e o MVP, com o resumo da sala', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('results', true)
    room.intermission.summary = [summaryRow('local', 900), summaryRow('bot-0', 400)]
    const events = run(director, room, 0.1)
    expect(events).toEqual([{ kind: 'over', mvpId: 'local' }, { kind: 'results' }])
  })

  it('o resumo que chega depois do fim troca a ordem final', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('over', true)
    run(director, room, 0.1)
    expect(director.standings[0]?.playerId).toBe('bot-0')
    room.intermission.summary = [summaryRow('local', 900)]
    run(director, room, 0.1)
    expect(director.standings[0]?.playerId).toBe('local')
  })

  it('a cabine mostra os votos da sala, e não sorteia os dos bots', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('results', true)
    run(director, room, 0.1)
    expect(director.booth.ballots).toEqual([])
    room.intermission.ballots.push({ voterId: 'bot-0', optionIndex: 1 })
    run(director, room, 0.1)
    expect(choiceOf(director.booth, 'bot-0')).toBe(1)
  })

  it('o voto do jogador vai para a sala, uma vez por troca', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('results', true)
    run(director, room, 0.1)
    const vote = [{ kind: 'vote', index: 2 }] as const
    expect(stepMatchEnd(director, room, 1 / 60, vote)).toEqual({ kind: 'vote', optionIndex: 2 })
    expect(stepMatchEnd(director, room, 1 / 60, vote)).toBeUndefined()
  })

  it('o voto fechado é o da sala', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('decided', true)
    Object.assign(room.intermission, { winner: 2, nextArenaId: 'ichiban-gai' })
    const events = run(director, room, 0.1)
    expect(events.at(-1)).toEqual({
      kind: 'decided',
      outcome: { optionId: 'random', mapId: 'ichiban-gai', tied: false },
    })
  })

  it('sem o voto da sala no estado ainda, fecha com os votos à vista', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('decided', true)
    room.intermission.ballots.push({ voterId: 'bot-0', optionIndex: 1 })
    run(director, room, 0.1)
    expect(director.outcome).toMatchObject({ optionId: 'ichiban-gai', mapId: 'ichiban-gai' })
  })

  it('a partida seguinte é da sala: o intervalo não pede a próxima', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('decided', true)
    const events = run(director, room, decidedHoldS + 1)
    expect(events.map((event) => event.kind)).not.toContain('next')
    expect(room.cycle.phase).toBe('decided')
  })

  it('outro fim visto sem a partida no meio começa de novo pelo fim', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('decided', true)
    run(director, room, 0.1)
    room.cycle.phase = 'over'
    expect(stepMatchEnd(director, room, 1 / 60, [])).toMatchObject({ kind: 'over' })
  })

  it('do aquecimento para a partida, nada na tela', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomAt('warmup', true)
    expect(run(director, room, 0.1)).toEqual([])
    expect(director.phase).toBe('warmup')
  })
})
