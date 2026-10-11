import { readFileSync } from 'node:fs'
import { parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { withTickHzOverride } from './tickHzOverride.ts'

const CONFIG = parseGameplayConfig(
  JSON.parse(readFileSync(new URL('../../../../config/gameplay.json', import.meta.url), 'utf8')),
)

describe('withTickHzOverride', () => {
  it('no modo de medição, troca o tick', () => {
    expect(withTickHzOverride(CONFIG, '?perf=1&tickHz=120').simulation.tickHz).toBe(120)
  })

  it('fora do modo de medição, o tick é o do jogo', () => {
    expect(withTickHzOverride(CONFIG, '?tickHz=120')).toBe(CONFIG)
  })

  it.each([
    '?perf=1&tickHz=999',
    '?perf=1&tickHz=10',
    '?perf=1&tickHz=59.5',
    '?perf=1&tickHz=abc',
    '?perf=1',
  ])('ignora %s', (search) => {
    expect(withTickHzOverride(CONFIG, search)).toBe(CONFIG)
  })

  it('não mexe no resto da configuração', () => {
    const changed = withTickHzOverride(CONFIG, '?perf=1&tickHz=120')
    expect(changed.weapon).toBe(CONFIG.weapon)
  })
})
