import { addPlayer, createScoreboard, finalStandings, RANDOM_MAP_OPTION } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { castVote, closeVoteBooth, openVoteBooth } from './mapVoteBooth.ts'
import type { MatchEndFlow } from './matchEndFlow.ts'
import {
  type MatchEndScreenInput,
  matchEndScreenKey,
  matchEndScreenOf,
  mvpStats,
} from './matchEndScreen.ts'

const ARENAS = [
  { id: 'neon-kaido', label: 'NEON-KAIDŌ' },
  { id: 'ichiban-gai', label: 'ICHIBAN-GAI' },
]
const NAMES: Readonly<Record<string, string>> = { local: 'NICO', 'bot-0': 'VEX', 'bot-1': 'ONI' }

function inputAt(flow: MatchEndFlow, over: Partial<MatchEndScreenInput> = {}): MatchEndScreenInput {
  const board = createScoreboard()
  addPlayer(board, 'local').points = 300
  Object.assign(addPlayer(board, 'local'), { kills: 3, deaths: 1, bestStreak: 2, medals: 4 })
  addPlayer(board, 'bot-0').points = 500
  addPlayer(board, 'bot-1')
  return {
    flow,
    standings: finalStandings(board),
    nameOf: (id) => NAMES[id] ?? id,
    portraits: new Map([['bot-0', '/vex.webp']]),
    localId: 'local',
    booth: openVoteBooth(ARENAS, ['bot-0', 'bot-1'], 3),
    outcome: undefined,
    ...over,
  }
}

const RESULTS: MatchEndFlow = { phase: 'results', phaseS: 0.5 }

describe('matchEndScreenOf', () => {
  it('nada na tela com a partida correndo, ou já na seguinte', () => {
    expect(matchEndScreenOf(inputAt({ phase: 'playing', phaseS: 0 }))).toBeNull()
    expect(matchEndScreenOf(inputAt({ phase: 'done', phaseS: 0 }))).toBeNull()
  })

  it('o MVP é o primeiro da ordem final, com nome, retrato e números', () => {
    const screen = matchEndScreenOf(inputAt(RESULTS))
    expect(screen?.mvp).toEqual({
      name: 'VEX',
      portraitUrl: '/vex.webp',
      local: false,
      points: 500,
      kills: 0,
      deaths: 0,
      bestStreak: 0,
      medals: 0,
    })
  })

  it('o jogador como MVP é marcado como local', () => {
    const input = inputAt(RESULTS)
    const standings = [...input.standings].reverse()
    const local = standings.find((score) => score.playerId === 'local')
    const screen = matchEndScreenOf({ ...input, standings: [local as never, ...standings] })
    expect(screen?.mvp?.local).toBe(true)
    expect(screen?.mvp?.medals).toBe(4)
  })

  it('sem ninguém no placar, não há MVP', () => {
    expect(matchEndScreenOf(inputAt(RESULTS, { standings: [] }))?.mvp).toBeUndefined()
  })

  it('o placar final é a sala inteira, na ordem final', () => {
    const screen = matchEndScreenOf(inputAt(RESULTS))
    expect(screen?.standings.map((row) => row.name)).toEqual(['VEX', 'NICO', 'ONI'])
    expect(screen?.secondsLeft).toBe(10)
  })

  it('no congelamento, o voto ainda não abriu: nenhum voto à vista', () => {
    const screen = matchEndScreenOf(inputAt({ phase: 'over', phaseS: 1 }))
    expect(screen?.phase).toBe('over')
    expect(screen?.options.map((option) => option.votes)).toEqual([0, 0, 0])
  })

  it('os votos dos bots aparecem conforme chegam, com o nome de quem votou', () => {
    const early = matchEndScreenOf(inputAt(RESULTS))
    const late = matchEndScreenOf(inputAt({ phase: 'results', phaseS: 9 }))
    expect(early?.options.reduce((sum, option) => sum + option.votes, 0)).toBe(0)
    expect(late?.options.reduce((sum, option) => sum + option.votes, 0)).toBe(2)
    expect(late?.options.flatMap((option) => option.voters).sort()).toEqual(['ONI', 'VEX'])
  })

  it('marca o voto do jogador e o foco', () => {
    const input = inputAt(RESULTS)
    castVote(input.booth as never, 'local', 2, 0.4)
    const screen = matchEndScreenOf(input)
    expect(screen?.options.map((option) => [option.mine, option.focused])).toEqual([
      [false, false],
      [false, false],
      [true, true],
    ])
  })

  it('com o voto fechado: o vencedor, o mapa que vem, e foco nenhum', () => {
    const input = inputAt({ phase: 'decided', phaseS: 0 })
    castVote(input.booth as never, 'local', 1, 0.4)
    const outcome = closeVoteBooth(input.booth)
    const screen = matchEndScreenOf({ ...input, outcome })
    const winner = screen?.options.find((option) => option.winner)
    expect(winner?.label).toBe(
      outcome.optionId === RANDOM_MAP_OPTION ? 'ALEATÓRIO' : screen?.nextMapLabel,
    )
    expect(screen?.nextMapLabel).toBe(ARENAS.find((arena) => arena.id === outcome.mapId)?.label)
    expect(screen?.options.some((option) => option.focused)).toBe(false)
    expect(screen?.options.reduce((sum, option) => sum + option.votes, 0)).toBe(3)
  })
})

describe('matchEndScreenKey', () => {
  it('muda com a contagem, e não entre dois quadros do mesmo segundo', () => {
    const at = (phaseS: number) => matchEndScreenKey(inputAt({ phase: 'results', phaseS }))
    expect(at(0.2)).toBe(at(0.4))
    expect(at(0.2)).not.toBe(at(1.2))
  })

  it('muda com o foco e com o voto', () => {
    const input = inputAt(RESULTS)
    const before = matchEndScreenKey(input)
    castVote(input.booth as never, 'local', 1, 0.4)
    expect(matchEndScreenKey(input)).not.toBe(before)
  })

  it('muda quando o voto fecha', () => {
    const input = inputAt({ phase: 'decided', phaseS: 0 })
    expect(matchEndScreenKey({ ...input, outcome: closeVoteBooth(input.booth) })).not.toBe(
      matchEndScreenKey(input),
    )
  })
})

describe('mvpStats', () => {
  it('os números do MVP em texto, os que o fizeram MVP primeiro', () => {
    const card = matchEndScreenOf(inputAt(RESULTS))?.mvp
    expect(mvpStats(card as never)).toEqual([
      { label: 'PONTOS', value: '500' },
      { label: 'ABATES', value: '0' },
      { label: 'MORTES', value: '0' },
      { label: 'MELHOR SEQUÊNCIA', value: '0' },
      { label: 'MEDALHAS', value: '0' },
    ])
  })
})
