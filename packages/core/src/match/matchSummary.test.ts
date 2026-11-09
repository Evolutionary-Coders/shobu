import { describe, expect, it } from 'vitest'
import { addPlayer, createScoreboard, recordShot } from '../scoring/scoreboard.ts'
import { podiumOf, summarizeMatch } from './matchSummary.ts'

function boardOf(): ReturnType<typeof createScoreboard> {
  const board = createScoreboard()
  Object.assign(addPlayer(board, 'ana'), { points: 300, kills: 3, deaths: 2, bestStreak: 2 })
  Object.assign(addPlayer(board, 'bia'), { points: 500, kills: 4, deaths: 0, medals: 3 })
  addPlayer(board, 'caio')
  addPlayer(board, 'duda')
  return board
}

describe('summarizeMatch', () => {
  it('lista do MVP ao último, pela regra do MVP', () => {
    expect(summarizeMatch(boardOf()).map((row) => row.playerId)).toEqual([
      'bia',
      'ana',
      'caio',
      'duda',
    ])
  })

  it('divide abates por mortes, e sem morte o K/D são os abates', () => {
    const [bia, ana, caio] = summarizeMatch(boardOf())
    expect(bia).toMatchObject({ kd: 4, medals: 3, points: 500 })
    expect(ana).toMatchObject({ kd: 1.5, bestStreak: 2, deaths: 2, kills: 3 })
    expect(caio?.kd).toBe(0)
  })

  it('divide acertos por tiros, e quem não atirou tem precisão 0', () => {
    const board = boardOf()
    recordShot(board, 'ana', true)
    recordShot(board, 'ana', false)
    recordShot(board, 'ana', false)
    recordShot(board, 'ana', true)
    const rows = summarizeMatch(board)
    expect(rows.find((row) => row.playerId === 'ana')?.accuracy).toBe(0.5)
    expect(rows.find((row) => row.playerId === 'bia')?.accuracy).toBe(0)
  })
})

describe('podiumOf', () => {
  it('são os três primeiros', () => {
    expect(podiumOf(summarizeMatch(boardOf())).map((row) => row.playerId)).toEqual([
      'bia',
      'ana',
      'caio',
    ])
  })

  it('numa sala de dois, o pódio tem dois', () => {
    const board = createScoreboard()
    addPlayer(board, 'ana')
    addPlayer(board, 'bia')
    expect(podiumOf(summarizeMatch(board))).toHaveLength(2)
  })
})
