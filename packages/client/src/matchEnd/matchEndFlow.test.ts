import { describe, expect, it } from 'vitest'
import {
  advanceMatchEndFlow,
  createMatchEndFlow,
  DECIDED_HOLD_S,
  MATCH_OVER_HOLD_S,
  type MatchEndFlow,
  RESULTS_S,
  resultsSecondsLeft,
} from './matchEndFlow.ts'

/** Anda `seconds` em quadros de 60 Hz, com a partida acabada. */
function runOver(flow: MatchEndFlow, seconds: number): void {
  for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
    advanceMatchEndFlow(flow, true, 1 / 60)
  }
}

describe('advanceMatchEndFlow', () => {
  it('com a partida correndo, fica jogando', () => {
    const flow = createMatchEndFlow()
    expect(advanceMatchEndFlow(flow, false, 1)).toBe(false)
    expect(flow.phase).toBe('playing')
  })

  it('o tempo acabou: congela no mesmo quadro, e avisa a troca', () => {
    const flow = createMatchEndFlow()
    expect(advanceMatchEndFlow(flow, true, 1 / 60)).toBe(true)
    expect(flow.phase).toBe('over')
  })

  it('depois do congelamento, a tela de MVP; depois dela, o mapa decidido; e então a próxima', () => {
    const flow = createMatchEndFlow()
    advanceMatchEndFlow(flow, true, 1 / 60)
    runOver(flow, MATCH_OVER_HOLD_S - 0.1)
    expect(flow.phase).toBe('over')
    runOver(flow, 0.2)
    expect(flow.phase).toBe('results')
    runOver(flow, RESULTS_S)
    expect(flow.phase).toBe('decided')
    runOver(flow, DECIDED_HOLD_S + 0.1)
    expect(flow.phase).toBe('done')
    runOver(flow, 5)
    expect(flow.phase).toBe('done')
  })

  it('um quadro longo anda uma fase só: não pula a tela de MVP', () => {
    const flow = createMatchEndFlow()
    advanceMatchEndFlow(flow, true, 0)
    advanceMatchEndFlow(flow, true, 60)
    expect(flow.phase).toBe('results')
  })

  it('a partida nova volta a jogar, de qualquer fase', () => {
    const flow = createMatchEndFlow()
    advanceMatchEndFlow(flow, true, 0)
    runOver(flow, 5)
    expect(advanceMatchEndFlow(flow, false, 1 / 60)).toBe(true)
    expect(flow).toEqual(createMatchEndFlow())
  })
})

describe('resultsSecondsLeft', () => {
  it('conta de 10 a 1 na tela de MVP, como o relógio da partida', () => {
    expect(resultsSecondsLeft({ phase: 'results', phaseS: 0 })).toBe(10)
    expect(resultsSecondsLeft({ phase: 'results', phaseS: 0.2 })).toBe(10)
    expect(resultsSecondsLeft({ phase: 'results', phaseS: 9.5 })).toBe(1)
  })

  it('zero fora dela', () => {
    expect(resultsSecondsLeft({ phase: 'decided', phaseS: 0 })).toBe(0)
    expect(resultsSecondsLeft({ phase: 'results', phaseS: 12 })).toBe(0)
  })
})
