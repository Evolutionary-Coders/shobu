import { addPlayer, createScoreboard, rankedScores } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { scoreboardRows } from './scoreboardRows.ts'

function boardWith(points: Readonly<Record<string, number>>) {
  const board = createScoreboard()
  for (const [id, value] of Object.entries(points)) {
    const score = addPlayer(board, id)
    score.points = value
    score.kills = value / 100
    score.deaths = 1
  }
  return rankedScores(board, [])
}

const NAMES: Readonly<Record<string, string>> = { local: 'VOCÊ', 'bot-0': 'ONRYO', 'bot-1': 'VOLT' }
const nameOf = (id: string): string => NAMES[id] ?? id

describe('scoreboardRows', () => {
  it('ordena por pontos, com nome da tela, abates e mortes', () => {
    const rows = scoreboardRows(boardWith({ local: 100, 'bot-0': 300 }), nameOf, 'local')
    expect(rows).toEqual([
      { rank: 1, name: 'ONRYO', points: 300, kills: 3, deaths: 1, local: false },
      { rank: 2, name: 'VOCÊ', points: 100, kills: 1, deaths: 1, local: true },
    ])
  })

  /** Empate fica empate (GDD): a posição é dividida, e a seguinte pula. */
  it('empatados dividem a posição, e o próximo pula para a dele', () => {
    const rows = scoreboardRows(
      boardWith({ local: 200, 'bot-0': 200, 'bot-1': 100 }),
      nameOf,
      'local',
    )
    expect(rows.map((row) => row.rank)).toEqual([1, 1, 3])
  })

  it('no começo, todo mundo em zero divide o primeiro lugar', () => {
    const rows = scoreboardRows(boardWith({ local: 0, 'bot-0': 0, 'bot-1': 0 }), nameOf, 'local')
    expect(rows.map((row) => row.rank)).toEqual([1, 1, 1])
  })

  it('placar vazio não tem linha', () => {
    expect(scoreboardRows([], nameOf, 'local')).toEqual([])
  })
})
