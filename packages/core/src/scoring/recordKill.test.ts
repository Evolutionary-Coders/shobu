import { describe, expect, it } from 'vitest'
import { config } from '../bots/botTestKit.ts'
import type { MedalAward } from '../medals/awardMedals.ts'
import { createKillEvent } from './killEvent.ts'
import { recordKill } from './recordKill.ts'
import { createScoreboard } from './scoreboard.ts'

describe('recordKill', () => {
  it('a primeira kill da partida pontua a kill mais o first blood, e devolve o total', () => {
    const board = createScoreboard()
    const kill = { ...createKillEvent(), shooterId: 'bot-0', victimId: 'local', distanceM: 20 }
    const medals: MedalAward[] = []
    const points = recordKill(board, kill, config, medals)
    expect(medals.map((award) => award.medal.slug)).toContain('first-blood')
    expect(points).toBeGreaterThan(config.match.pointsPerKill)
    expect(board.players.get('bot-0')?.points).toBe(points)
    expect(board.players.get('local')?.deaths).toBe(1)
  })

  it('matar a si mesmo não pontua nem dá medalha', () => {
    const board = createScoreboard()
    const kill = { ...createKillEvent(), shooterId: 'bot-0', victimId: 'bot-0' }
    const medals: MedalAward[] = []
    expect(recordKill(board, kill, config, medals)).toBe(0)
    expect(medals).toEqual([])
  })

  it('conta as medalhas da kill no placar do atirador, que é o que a tela de MVP lê', () => {
    const board = createScoreboard()
    const kill = { ...createKillEvent(), shooterId: 'bot-0', victimId: 'local', distanceM: 20 }
    const medals: MedalAward[] = []
    recordKill(board, kill, config, medals)
    expect(board.players.get('bot-0')?.medals).toBe(medals.length)
    expect(medals.length).toBeGreaterThan(0)
  })

  it('duas kills no mesmo vetor: cada uma conta e pontua só as próprias medalhas', () => {
    const board = createScoreboard()
    const medals: MedalAward[] = []
    const first = { ...createKillEvent(), shooterId: 'bot-0', victimId: 'local', distanceM: 20 }
    const firstPoints = recordKill(board, first, config, medals)
    const afterFirst = medals.length
    const second = { ...first, victimId: 'bot-1', atS: 1 }
    const secondPoints = recordKill(board, second, config, medals)
    expect(medals.length).toBeGreaterThan(afterFirst)
    expect(board.players.get('bot-0')?.medals).toBe(medals.length)
    expect(board.players.get('bot-0')?.points).toBe(firstPoints + secondPoints)
  })
})
