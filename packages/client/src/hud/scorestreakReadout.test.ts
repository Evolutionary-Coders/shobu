import { createScorestreakSlots, type ScorestreakNotice } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { config } from '../controller/arenaSessionTestKit.ts'
import { actionForKeyCode } from '../controller/heldKeys.ts'
import {
  scorestreakKeyHint,
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
    const rows = scorestreakRowsOf(slotsOf(), config.scorestreaks.pingCost / 2, config, 'keyboard')
    expect(rows[0]).toEqual({
      label: 'PING',
      iconUrl: '/assets/images/scorestreaks/ping.svg',
      cost: config.scorestreaks.pingCost,
      progress: 0.5,
      phase: 'charging',
      keyHint: '3',
    })
    expect(rows.map((row) => row.label)).toEqual(['PING', 'FERROLHO RÁPIDO', 'GOLPE ORBITAL'])
  })

  it('a barra para cheia, e quem diz pronta são os slots: cheia sem pronta é gasta', () => {
    const rows = scorestreakRowsOf(slotsOf([false, true, false]), 1_000_000, config, 'keyboard')
    expect(rows.map((row) => [row.progress, row.phase])).toEqual([
      [1, 'spent'],
      [1, 'ready'],
      [1, 'spent'],
    ])
  })

  it('a tecla de cada linha é a da entrada em uso', () => {
    const rows = scorestreakRowsOf(slotsOf(), 0, config, 'gamepad')
    expect(rows.map((row) => row.keyHint)).toEqual(['←', '→', '↓'])
  })
})

describe('scorestreakKeyHint', () => {
  it.each([
    ['keyboard', ['3', '4', '5']],
    ['gamepad', ['←', '→', '↓']],
    ['touch', ['1', '2', '3']],
  ] as const)('%s → %j', (method, hints) => {
    expect([0, 1, 2].map((slot) => scorestreakKeyHint(slot, method))).toEqual(hints)
  })

  /** A dica escrita à mão não pode mentir sobre a tecla que `heldKeys.ts` liga. */
  it('a dica do teclado é a tecla que aciona o slot', () => {
    for (const slot of [0, 1, 2]) {
      const code = `Digit${scorestreakKeyHint(slot, 'keyboard')}`
      expect(actionForKeyCode(code)).toBe(`scorestreak${slot + 1}`)
    }
  })

  it('recusa slot fora dos três dizendo qual veio', () => {
    expect(() => scorestreakKeyHint(3, 'keyboard')).toThrow(/slot 3/)
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
