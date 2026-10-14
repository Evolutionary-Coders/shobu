import { describe, expect, it } from 'vitest'
import { createKillEvent, type KillEvent, type MutableKillEvent } from '../scoring/killEvent.ts'
import { addPlayer, applyKill, createScoreboard, type Scoreboard } from '../scoring/scoreboard.ts'
import { compareForMvp, finalStandings, pickMvp } from './matchMvp.ts'

function kill(board: Scoreboard, shooterId: string, victimId: string, atS = 0): void {
  const event: KillEvent = Object.assign(createKillEvent() as MutableKillEvent, {
    shooterId,
    victimId,
    atS,
  })
  applyKill(board, event, 100)
}

function boardOf(...ids: string[]): Scoreboard {
  const board = createScoreboard()
  for (const id of ids) addPlayer(board, id)
  return board
}

describe('pickMvp', () => {
  it('é quem tem mais pontos', () => {
    const board = boardOf('local', 'bot-0', 'bot-1')
    kill(board, 'bot-1', 'local')
    expect(pickMvp(board)?.playerId).toBe('bot-1')
  })

  it('não existe com o placar vazio', () => {
    expect(pickMvp(createScoreboard())).toBeUndefined()
  })

  it('pontos empatados: mais abates vence, porque o outro pontuou em medalha', () => {
    const board = boardOf('a', 'b', 'c')
    kill(board, 'a', 'c')
    kill(board, 'a', 'c')
    addPlayer(board, 'b').points = 200
    addPlayer(board, 'b').kills = 1
    expect(pickMvp(board)?.playerId).toBe('a')
  })

  it('pontos e abates empatados: menos mortes vence', () => {
    const board = boardOf('a', 'b', 'c')
    kill(board, 'a', 'c')
    kill(board, 'b', 'c')
    kill(board, 'c', 'a')
    kill(board, 'b', 'c')
    kill(board, 'a', 'c')
    const [a, b] = [addPlayer(board, 'a'), addPlayer(board, 'b')]
    expect(compareForMvp(b, a)).toBe(-1)
    expect(pickMvp(board)?.playerId).toBe('b')
  })

  it('tudo empatado: vence quem chegou antes aos pontos', () => {
    const board = boardOf('a', 'b', 'c')
    kill(board, 'b', 'c', 10)
    kill(board, 'a', 'c', 20)
    expect(pickMvp(board)?.playerId).toBe('b')
  })

  it('a sala inteira em zero: o primeiro a entrar, a regra de desempate do GDD', () => {
    expect(pickMvp(boardOf('local', 'bot-0'))?.playerId).toBe('local')
  })
})

describe('finalStandings', () => {
  it('ordena a sala inteira pela regra do MVP', () => {
    const board = boardOf('local', 'bot-0', 'bot-1', 'bot-2')
    kill(board, 'bot-2', 'local', 1)
    kill(board, 'bot-2', 'bot-0', 2)
    kill(board, 'bot-1', 'local', 3)
    expect(finalStandings(board).map((score) => score.playerId)).toEqual([
      'bot-2',
      'bot-1',
      'bot-0',
      'local',
    ])
  })

  it('não mexe no placar', () => {
    const board = boardOf('a', 'b')
    kill(board, 'b', 'a')
    finalStandings(board)
    expect([...board.players.keys()]).toEqual(['a', 'b'])
  })
})
