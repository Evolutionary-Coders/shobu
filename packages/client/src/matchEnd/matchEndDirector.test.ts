import { addPlayer } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { mountSession } from '../controller/arenaSessionTestKit.ts'
import { choiceOf } from './mapVoteBooth.ts'
import {
  createMatchEndDirector,
  type MatchEndDirector,
  type MatchEndEvent,
  type MatchEndRoom,
  stepMatchEnd,
} from './matchEndDirector.ts'
import { DECIDED_HOLD_S, MATCH_OVER_HOLD_S, RESULTS_S } from './matchEndFlow.ts'

const ARENAS = [
  { id: 'neon-kaido', label: 'NEON-KAIDŌ' },
  { id: 'ichiban-gai', label: 'ICHIBAN-GAI' },
]

/** A sala do kit de testes da sessão: o jogador e um bot, com o placar de verdade. */
function roomOf(matchOver: boolean): MatchEndRoom {
  const { session } = mountSession()
  addPlayer(session.scoreboard as never, 'bot-0').points = 400
  return {
    matchOver,
    scoreboard: session.scoreboard,
    bots: session.bots,
    matchSeed: session.matchSeed,
    arenas: ARENAS,
    localId: 'local',
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

describe('stepMatchEnd', () => {
  it('com a partida correndo, nada acontece', () => {
    expect(run(createMatchEndDirector(ARENAS), roomOf(false), 1)).toEqual([])
  })

  it('o fim inteiro: congela com o MVP, abre a tela, fecha o voto e pede a próxima', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomOf(true)
    const events = run(director, room, MATCH_OVER_HOLD_S + RESULTS_S + DECIDED_HOLD_S + 0.5)
    expect(events.map((event) => event.kind)).toEqual(['over', 'results', 'decided', 'next'])
    expect(events[0]).toEqual({ kind: 'over', mvpId: 'bot-0' })
    const next = events[3]
    expect(next?.kind === 'next' && ARENAS.some((arena) => arena.id === next.mapId)).toBe(true)
  })

  it('a ordem final congela no fim: o placar que muda depois não muda o MVP', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomOf(true)
    run(director, room, 0.1)
    addPlayer(room.scoreboard as never, 'local').points = 9_000
    expect(director.standings[0]?.playerId).toBe('bot-0')
  })

  it('os bots da sala votam; o banco não', () => {
    const director = createMatchEndDirector(ARENAS)
    run(director, roomOf(true), 0.1)
    expect(director.booth.ballots.map((ballot) => ballot.voterId)).toEqual(['bot-0'])
  })

  it('o voto do jogador só vale com a tela de MVP aberta', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomOf(true)
    stepMatchEnd(director, room, 1 / 60, [])
    stepMatchEnd(director, room, 1 / 60, [{ kind: 'vote', index: 1 }])
    expect(choiceOf(director.booth, 'local')).toBe(-1)
    run(director, room, MATCH_OVER_HOLD_S)
    stepMatchEnd(director, room, 1 / 60, [{ kind: 'vote', index: 1 }])
    expect(choiceOf(director.booth, 'local')).toBe(1)
  })

  it('o voto do jogador junto com o do bot decide sem sorteio', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomOf(true)
    run(director, room, MATCH_OVER_HOLD_S + 0.1)
    const botChoice = director.booth.ballots[0]?.optionId
    const index = director.booth.choices.findIndex((choice) => choice.id === botChoice)
    stepMatchEnd(director, room, 1 / 60, [{ kind: 'vote', index }])
    run(director, room, RESULTS_S)
    expect(director.outcome).toMatchObject({ optionId: botChoice, tied: false })
  })

  it('pedir o menu na tela de MVP é o evento de sair', () => {
    const director = createMatchEndDirector(ARENAS)
    const room = roomOf(true)
    run(director, room, MATCH_OVER_HOLD_S + 0.1)
    expect(stepMatchEnd(director, room, 1 / 60, [{ kind: 'leave' }])).toEqual({ kind: 'leave' })
  })

  it('a partida seguinte volta a jogar e limpa o resultado', () => {
    const director = createMatchEndDirector(ARENAS)
    run(director, roomOf(true), MATCH_OVER_HOLD_S + RESULTS_S + 0.5)
    expect(director.outcome).toBeDefined()
    expect(stepMatchEnd(director, roomOf(false), 1 / 60, [])).toEqual({ kind: 'playing' })
    expect(director.outcome).toBeUndefined()
  })
})
