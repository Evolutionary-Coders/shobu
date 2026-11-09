import { KICK_BALLOT_CAST, KICK_BALLOT_PENDING } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { type KickVoteFields, readKickVote } from './kickVoteView.ts'

const OPEN: KickVoteFields = {
  targetId: 'bia',
  targetName: 'BIA',
  initiatorId: 'ana',
  leftDs: 195,
  yes: 1,
  no: 1,
  needed: 2,
  ballots: new Map([
    ['ana', KICK_BALLOT_CAST],
    ['caio', KICK_BALLOT_PENDING],
    ['duda', KICK_BALLOT_CAST],
  ]),
}

describe('readKickVote', () => {
  it('sem voto, sem estado ou de um servidor sem ele, não há voto', () => {
    expect(readKickVote(undefined, 'ana')).toBeUndefined()
    expect(readKickVote({ ...OPEN, targetId: '' }, 'ana')).toBeUndefined()
  })

  it('lê o tempo em segundos e as contagens', () => {
    expect(readKickVote(OPEN, 'caio')).toEqual({
      targetId: 'bia',
      targetName: 'BIA',
      initiatorId: 'ana',
      leftS: 19.5,
      yes: 1,
      no: 1,
      needed: 2,
      isTarget: false,
      isEligible: true,
      hasVoted: false,
    })
  })

  it.each(['ana', 'duda'])('%s já votou', (ownId) => {
    expect(readKickVote(OPEN, ownId)?.hasVoted).toBe(true)
  })

  it('o alvo não vota', () => {
    expect(readKickVote(OPEN, 'bia')).toMatchObject({ isTarget: true, isEligible: false })
  })

  it('sem sala, ninguém vota', () => {
    expect(readKickVote(OPEN, undefined)).toMatchObject({ isTarget: false, isEligible: false })
  })
})
