import type { MatchSummaryRow } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createRoomMatchView, type RoomMatchView } from '../net/roomMatchView.ts'
import { AHEAD, mountOnline, snapshotAt } from './arenaOnlineTestKit.ts'
import { LOCAL_PLAYER_ID } from './arenaSession.ts'

function row(playerId: string, points: number): MatchSummaryRow {
  return { playerId, points, kills: 1, deaths: 0, kd: 1, accuracy: 0.5, bestStreak: 1, medals: 0 }
}

function matchView(
  phase: RoomMatchView['phase'],
  over: Partial<RoomMatchView> = {},
): RoomMatchView {
  return { ...createRoomMatchView(), phase, phaseLeftS: 5, arenaId: 'neon-kaido', ...over }
}

/** A sala com a Ana sentada na primeira vaga. */
function mountWithAna(): ReturnType<typeof mountOnline> {
  const rig = mountOnline()
  rig.room.remotes.set('ana', snapshotAt(AHEAD))
  rig.frame()
  return rig
}

describe('followRoomIntermission', () => {
  it('a sessão sabe que a sala é que manda', () => {
    const rig = mountOnline()
    expect(rig.session.online).toBe(false)
    rig.frame()
    expect(rig.session.online).toBe(true)
  })

  it('o resumo chega com os ids da sessão; quem já saiu fica de fora', () => {
    const rig = mountWithAna()
    rig.room.summaries.push([row('ana', 500), row('eu', 300), row('foi-embora', 100)])
    rig.frame()
    const ids = rig.session.roomIntermission.summary?.map((summary) => summary.playerId)
    expect(ids).toEqual(['bot-0', LOCAL_PLAYER_ID])
  })

  it('com a arena congelada, os votos e o resultado da sala', () => {
    const rig = mountWithAna()
    rig.room.ballots.set('ana', 1).set('eu', 0).set('quem', 2)
    rig.room.match = matchView('decided', { winner: 1, nextArenaId: 'ichiban-gai' })
    rig.frame()
    expect(rig.session.roomIntermission).toMatchObject({
      ballots: [
        { voterId: 'bot-0', optionIndex: 1 },
        { voterId: LOCAL_PLAYER_ID, optionIndex: 0 },
      ],
      winner: 1,
      nextArenaId: 'ichiban-gai',
    })
  })

  /** O laço de jogo não aloca: com a partida correndo, os votos nem são lidos. */
  it('com a partida correndo, os votos não são lidos', () => {
    const rig = mountWithAna()
    rig.room.ballots.set('ana', 1)
    rig.room.match = matchView('live')
    rig.frame()
    expect(rig.session.roomIntermission.ballots).toEqual([])
  })

  it('a partida seguinte fecha o intervalo', () => {
    const rig = mountWithAna()
    rig.room.summaries.push([row('eu', 300)])
    rig.room.ballots.set('ana', 1)
    rig.room.match = matchView('results')
    rig.frame()
    rig.room.match = matchView('warmup')
    rig.frame()
    expect(rig.session.roomIntermission).toEqual({
      summary: undefined,
      ballots: [],
      winner: undefined,
      nextArenaId: undefined,
    })
  })
})
