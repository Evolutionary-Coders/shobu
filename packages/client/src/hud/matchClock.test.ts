import { describe, expect, it } from 'vitest'
import {
  CLOCK_FINAL_S,
  CLOCK_URGENT_S,
  clockLabel,
  clockTone,
  formatMatchClock,
  matchProgressPercent,
  TRAINING_CLOCK_LABEL,
} from './matchClock.ts'

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

describe('matchProgressPercent', () => {
  it('leva o progresso de 0 a 100 ao longo da partida', () => {
    expect(matchProgressPercent(300, 300)).toBe(0)
    expect(matchProgressPercent(150, 300)).toBe(50)
    expect(matchProgressPercent(0, 300)).toBe(100)
  })

  it('não passa de 100 nem volta abaixo de 0', () => {
    expect(matchProgressPercent(-10, 300)).toBe(100)
    expect(matchProgressPercent(400, 300)).toBe(0)
  })

  it('recusa partida sem duração', () => {
    expect(() => matchProgressPercent(10, 0)).toThrow(/durationS recebeu 0/)
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
