import { readFileSync } from 'node:fs'
import { parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { withMatchLengthOverride } from './matchLengthOverride.ts'

const CONFIG = parseGameplayConfig(
  JSON.parse(readFileSync(new URL('../../../../config/gameplay.json', import.meta.url), 'utf8')),
)

describe('withMatchLengthOverride', () => {
  it('no modo de medição, encurta a partida', () => {
    expect(withMatchLengthOverride(CONFIG, '?perf=1&matchS=30').match.durationS).toBe(30)
  })

  it('fora do modo de medição, a partida é a do jogo', () => {
    expect(withMatchLengthOverride(CONFIG, '?matchS=30')).toBe(CONFIG)
  })

  it.each(['?perf=1&matchS=5', '?perf=1&matchS=abc', '?perf=1'])('ignora %s', (search) => {
    expect(withMatchLengthOverride(CONFIG, search)).toBe(CONFIG)
  })

  it('não mexe no resto da partida', () => {
    const changed = withMatchLengthOverride(CONFIG, '?perf=1&matchS=45')
    expect(changed.match.respawnDelayS).toBe(CONFIG.match.respawnDelayS)
  })
})
