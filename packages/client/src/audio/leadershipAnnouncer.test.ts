import { readFileSync } from 'node:fs'
import { addPlayer, createScoreboard, type MatchConfig, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createLeadershipAnnouncer, type LeadershipStage } from './leadershipAnnouncer.ts'
import { FakeNarrator } from './narratorFake.ts'

const SHIPPED = parseGameplayConfig(
  JSON.parse(readFileSync(new URL('../../../../config/gameplay.json', import.meta.url), 'utf8')),
)
const match: MatchConfig = { ...SHIPPED.match, pointsPerKill: 100, scoreLimitPoints: 1000 }

const LIVE: LeadershipStage = { inArena: true, mode: 'match', phase: 'live', nowS: 42 }

function mount(recorded: readonly string[] = []) {
  const narrator = new FakeNarrator(recorded)
  const shown: string[] = []
  const announcer = createLeadershipAnnouncer({ narrator, showCallout: (text) => shown.push(text) })
  const board = createScoreboard()
  addPlayer(board, 'bot-0')
  addPlayer(board, 'local').points = 100
  return { narrator, shown, announcer, board }
}

describe('createLeadershipAnnouncer', () => {
  it('a voz que tem o take fala a liderança', () => {
    const rig = mount(['lead-taken'])
    rig.announcer.frame(LIVE, rig.board, 'local', match)
    expect(rig.narrator.said).toEqual(['lead-taken'])
    expect(rig.shown).toEqual([])
  })

  it('sem o take, o hud mostra o texto no lugar da voz', () => {
    const rig = mount()
    rig.announcer.frame(LIVE, rig.board, 'local', match)
    expect(rig.narrator.said).toEqual([])
    expect(rig.shown).toEqual(['ASSUMIU A LIDERANÇA'])
  })

  it('sem mudança no placar, nada', () => {
    const rig = mount()
    rig.announcer.frame(LIVE, rig.board, 'local', match)
    rig.announcer.frame(LIVE, rig.board, 'local', match)
    expect(rig.shown).toHaveLength(1)
  })

  it.each<Partial<LeadershipStage>>([
    { inArena: false },
    { mode: 'training' },
    { phase: 'warmup' },
    { phase: 'over' },
  ])('fora da partida valendo, cala: %o', (stage) => {
    const rig = mount()
    rig.announcer.frame({ ...LIVE, ...stage }, rig.board, 'local', match)
    expect(rig.shown).toEqual([])
  })
})
