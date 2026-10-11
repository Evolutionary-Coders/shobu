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
})
