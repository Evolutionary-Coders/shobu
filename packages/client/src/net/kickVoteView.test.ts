import { KICK_BALLOT_NO, KICK_BALLOT_PENDING, KICK_BALLOT_YES } from '@shobu/core'
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
    ['ana', KICK_BALLOT_YES],
    ['caio', KICK_BALLOT_PENDING],
    ['duda', KICK_BALLOT_NO],
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
      ownBallot: undefined,
    })
  })

  it.each([
    ['ana', true],
    ['duda', false],
  ])('%s já votou %s', (ownId, ballot) => {
    expect(readKickVote(OPEN, ownId)?.ownBallot).toBe(ballot)
  })

  it('o alvo não vota', () => {
    expect(readKickVote(OPEN, 'bia')).toMatchObject({ isTarget: true, isEligible: false })
  })

  it('sem sala, ninguém vota', () => {
    expect(readKickVote(OPEN, undefined)).toMatchObject({ isTarget: false, isEligible: false })
  })
})
