import { readFileSync } from 'node:fs'
import { createMatchCycle, type MatchCycle, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { resultsSecondsLeft } from './matchEndFlow.ts'

const { match } = parseGameplayConfig(
  JSON.parse(readFileSync(new URL('../../../../config/gameplay.json', import.meta.url), 'utf8')),
)

function at(phase: MatchCycle['phase'], phaseS: number): MatchCycle {
  return { ...createMatchCycle({ warmup: false, timed: true }), phase, phaseS }
}

describe('resultsSecondsLeft', () => {
  it('conta a tela de MVP para cima, de resultsS a 1', () => {
    expect(resultsSecondsLeft(at('results', 0), match)).toBe(match.resultsS)
    expect(resultsSecondsLeft(at('results', 0.2), match)).toBe(match.resultsS)
    expect(resultsSecondsLeft(at('results', match.resultsS - 0.5), match)).toBe(1)
  })

  it('é zero fora da tela de MVP, e depois que ela acaba', () => {
    expect(resultsSecondsLeft(at('decided', 0), match)).toBe(0)
    expect(resultsSecondsLeft(at('results', match.resultsS + 2), match)).toBe(0)
  })
})
