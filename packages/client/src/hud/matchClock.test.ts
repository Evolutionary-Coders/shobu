import { readFileSync } from 'node:fs'
import { createMatchCycle, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  CLOCK_FINAL_S,
  CLOCK_URGENT_S,
  clockBoxes,
  clockLabel,
  clockModeOf,
  clockTone,
  formatMatchClock,
  matchSecondsLeft,
  TRAINING_CLOCK_LABEL,
  WARMUP_CLOCK_LABEL,
} from './matchClock.ts'

const { match } = parseGameplayConfig(
  JSON.parse(readFileSync(new URL('../../../../config/gameplay.json', import.meta.url), 'utf8')),
)

describe('matchSecondsLeft', () => {
  it('conta o que falta da fase: o aquecimento, e depois a partida', () => {
    const cycle = createMatchCycle({ warmup: true, timed: true })
    cycle.phaseS = 2
    expect(matchSecondsLeft(cycle, match)).toBe(match.warmupS - 2)
    cycle.phase = 'live'
    expect(matchSecondsLeft(cycle, match)).toBe(match.durationS - 2)
  })

  /** A contagem do voto é da tela de MVP: o relógio da partida acabada fica no zero. */
  it('mostra zero com a arena congelada', () => {
    const cycle = createMatchCycle({ warmup: false, timed: true })
    cycle.phase = 'results'
    expect(matchSecondsLeft(cycle, match)).toBe(0)
  })

  it('sem relógio, devolve a duração cheia, finita', () => {
    const cycle = createMatchCycle({ warmup: false, timed: false })
    cycle.phaseS = 1_000
    expect(matchSecondsLeft(cycle, match)).toBe(match.durationS)
  })
})

describe('o aquecimento no relógio', () => {
  it('é da partida: o treino segue treino', () => {
    expect(clockModeOf('match', true)).toBe('warmup')
    expect(clockModeOf('match', false)).toBe('match')
    expect(clockModeOf('training', true)).toBe('training')
  })

  it('mostra o nome numa caixa e os segundos inteiros, para cima, na outra', () => {
    expect(clockBoxes('warmup', 9.5)).toEqual([WARMUP_CLOCK_LABEL, '10'])
    expect(clockLabel('warmup', 11.2)).toBe(`${WARMUP_CLOCK_LABEL} 12`)
  })
})

describe('formatMatchClock', () => {
  /** Com `floor`, o primeiro quadro de uma partida de 5 min mostraria 04:59. */
  it('mostra a duração cheia no primeiro quadro', () => {
    expect(formatMatchClock(300)).toBe('05:00')
  })

  it('arredonda para cima: dois décimos restantes ainda é um segundo', () => {
    expect(formatMatchClock(0.2)).toBe('00:01')
  })

  it('formata minuto e segundo com dois dígitos', () => {
    expect(formatMatchClock(65)).toBe('01:05')
    expect(formatMatchClock(9)).toBe('00:09')
  })

  it('trava em zero em vez de mostrar tempo negativo', () => {
    expect(formatMatchClock(-5)).toBe('00:00')
  })

  it('recusa tempo que não é número', () => {
    expect(() => formatMatchClock(Number.NaN)).toThrow(/secondsLeft recebeu NaN/)
  })
})

describe('clockTone', () => {
  it('vira urgente no último minuto e final nos últimos dez segundos', () => {
    expect(clockTone(120)).toBe('calm')
    expect(clockTone(CLOCK_URGENT_S)).toBe('urgent')
    expect(clockTone(CLOCK_FINAL_S)).toBe('final')
    expect(clockTone(0)).toBe('final')
  })
})

/**
 * O treino não tem cronômetro porque um relógio que zera sem consequência é
 * relógio mentindo — e hoje o fim de partida não existe. Quando existir, é este
 * mesmo tipo que separa os dois modos.
 */
describe('clockLabel', () => {
  it('a partida mostra a contagem', () => {
    expect(clockLabel('match', 300)).toBe('05:00')
  })

  it.each([300, 60, 0])('o treino mostra TREINO com %s segundos', (secondsLeft) => {
    expect(clockLabel('training', secondsLeft)).toBe(TRAINING_CLOCK_LABEL)
  })

  it('no treino o número não vaza para a tela', () => {
    expect(clockLabel('training', 123)).not.toMatch(/\d/)
  })
})

describe('clockBoxes', () => {
  it('a partida põe minutos e segundos em caixas separadas', () => {
    expect(clockBoxes('match', 65)).toEqual(['01', '05'])
  })

  it('o treino põe a palavra numa caixa só', () => {
    expect(clockBoxes('training', 65)).toEqual([TRAINING_CLOCK_LABEL])
  })
})
