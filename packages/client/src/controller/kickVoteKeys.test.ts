import { describe, expect, it } from 'vitest'
import { kickBallotForKey } from './kickVoteKeys.ts'

describe('kickBallotForKey', () => {
  it.each([
    ['F1', true],
    ['KeyY', true],
    ['F2', false],
    ['KeyN', false],
    ['KeyW', undefined],
    ['F3', undefined],
  ])('%s vota %s', (code, ballot) => {
    expect(kickBallotForKey(code)).toBe(ballot)
  })
})
