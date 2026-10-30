import { createScorestreakSlots, type ScorestreakNotice } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { config } from '../controller/arenaSessionTestKit.ts'
import {
  scorestreakReadoutKey,
  scorestreakRowsOf,
  scorestreakToastOf,
} from './scorestreakReadout.ts'

function slotsOf(ready: boolean[] = [false, false, false]) {
  const slots = createScorestreakSlots(['ping', 'rapid-bolt', 'orbital-strike'])
  slots.ready.splice(0, 3, ...ready)
  return slots
}

describe('scorestreakRowsOf', () => {
  it('a barra é a fração do custo que os pontos da vida pagaram', () => {
    const rows = scorestreakRowsOf(slotsOf(), config.scorestreaks.pingCost / 2, config)
    expect(rows[0]).toEqual({
      label: 'PING',
      cost: config.scorestreaks.pingCost,
      progress: 0.5,
      ready: false,
    })
    expect(rows.map((row) => row.label)).toEqual(['PING', 'FERROLHO RÁPIDO', 'GOLPE ORBITAL'])
  })

  it('a barra para cheia, e quem diz pronta são os slots', () => {
    const rows = scorestreakRowsOf(slotsOf([false, true, false]), 1_000_000, config)
    expect(rows.map((row) => [row.progress, row.ready])).toEqual([
      [1, false],
      [1, true],
      [1, false],
    ])
  })
})

describe('scorestreakReadoutKey', () => {
  it('muda com os pontos e com cada marca de pronta', () => {
    const keys = [
      scorestreakReadoutKey(0, slotsOf()),
      scorestreakReadoutKey(100, slotsOf()),
      scorestreakReadoutKey(0, slotsOf([true, false, false])),
      scorestreakReadoutKey(0, slotsOf([false, false, true])),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('scorestreakToastOf', () => {
  const nameOf = (playerId: string): string => playerId.toUpperCase()
  const notice = (kind: ScorestreakNotice['kind'], playerId: string): ScorestreakNotice => ({
    kind,
    playerId,
    slot: 0,
    scorestreak: 'ping',
  })

  it.each([
    ['earned', 'local', 'PING PRONTO'],
    ['activated', 'local', 'PING ATIVADO'],
    ['activated', 'bot-1', 'BOT-1 ATIVOU PING'],
    ['earned', 'bot-1', null],
  ] as const)('%s de %s → %s', (kind, playerId, text) => {
    expect(scorestreakToastOf(notice(kind, playerId), nameOf)).toBe(text)
  })
})
