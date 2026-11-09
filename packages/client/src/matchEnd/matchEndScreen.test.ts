import {
  addPlayer,
  createScoreboard,
  type MatchPhase,
  RANDOM_MAP_OPTION,
  summarizeMatch,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { castVote, closeVoteBooth, openVoteBooth } from './mapVoteBooth.ts'
import {
  accuracyLabel,
  kdLabel,
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

/** A fase da tela e o tempo nela; a contagem é a de uma tela de resultado de 10 s. */
interface ScreenClock {
  readonly phase: MatchPhase
  readonly phaseS: number
}

function inputAt(clock: ScreenClock, over: Partial<MatchEndScreenInput> = {}): MatchEndScreenInput {
  const board = createScoreboard()
  addPlayer(board, 'local').points = 300
  Object.assign(addPlayer(board, 'local'), { kills: 3, deaths: 1, bestStreak: 2, medals: 4 })
  addPlayer(board, 'bot-0').points = 500
  addPlayer(board, 'bot-1')
  return {
    ...clock,
    secondsLeft: clock.phase === 'results' ? Math.ceil(10 - clock.phaseS) : 0,
    standings: summarizeMatch(board),
    nameOf: (id) => NAMES[id] ?? id,
    portraits: new Map([['bot-0', '/vex.webp']]),
    localId: 'local',
    booth: openVoteBooth(ARENAS, ['bot-0', 'bot-1'], 3),
    outcome: undefined,
    ...over,
  }
}

const RESULTS: ScreenClock = { phase: 'results', phaseS: 0.5 }

describe('matchEndScreenOf', () => {
  it('nada na tela com a partida correndo, ou no aquecimento', () => {
    expect(matchEndScreenOf(inputAt({ phase: 'live', phaseS: 0 }))).toBeNull()
    expect(matchEndScreenOf(inputAt({ phase: 'warmup', phaseS: 0 }))).toBeNull()
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

describe('o pódio e o resumo', () => {
  it('o pódio são os três primeiros, do 1º ao 3º, com retrato e o jogador marcado', () => {
    const screen = matchEndScreenOf(inputAt(RESULTS))
    expect(screen?.podium).toEqual([
      { place: 1, name: 'VEX', portraitUrl: '/vex.webp', points: 500, local: false },
      { place: 2, name: 'NICO', portraitUrl: undefined, points: 300, local: true },
      { place: 3, name: 'ONI', portraitUrl: undefined, points: 0, local: false },
    ])
  })

  it('cada linha do placar final traz o resumo dele em texto', () => {
    const screen = matchEndScreenOf(inputAt(RESULTS))
    expect(screen?.standings[1]).toMatchObject({
      name: 'NICO',
      kills: 3,
      deaths: 1,
      kd: '3.00',
      accuracy: '0%',
      bestStreak: 2,
      medals: 4,
    })
  })

  it('o K/D com duas casas e a precisão em por cento', () => {
    expect(kdLabel(1.5)).toBe('1.50')
    expect(accuracyLabel(0.416)).toBe('42%')
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

  /** Online o resumo da sala chega depois do fim, e troca a ordem do placar daqui. */
  it('muda quando a ordem final muda', () => {
    const input = inputAt(RESULTS)
    const reversed = [...input.standings].reverse()
    expect(matchEndScreenKey({ ...input, standings: reversed })).not.toBe(matchEndScreenKey(input))
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
