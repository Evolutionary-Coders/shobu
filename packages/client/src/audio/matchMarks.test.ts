import { describe, expect, it } from 'vitest'
import { CLOCK_URGENT_S } from '../hud/matchClock.ts'
import { createMatchMarks, type MatchSituation } from './matchMarks.ts'

const MENU: MatchSituation = { inArena: false, mode: 'match', phase: 'live', secondsLeft: 300 }
const ARENA: MatchSituation = { ...MENU, inArena: true }

/** Assenta o quadro anterior antes de medir a borda que interessa. */
function marksAfter(first: MatchSituation, second: MatchSituation) {
  const marks = createMatchMarks()
  marks.since(first)
  return marks.since(second)
}

describe('createMatchMarks', () => {
  it('no menu não há marco nenhum', () => {
    expect(createMatchMarks().since(MENU)).toBeUndefined()
  })

  it('entrar na arena é o começo da partida', () => {
    expect(marksAfter(MENU, ARENA)).toBe('match-start')
  })

  it('o começo sai uma vez só, e não a cada quadro dentro da arena', () => {
    expect(marksAfter(ARENA, ARENA)).toBeUndefined()
  })

  it('cruzar o último minuto anuncia o último minuto', () => {
    const antes = { ...ARENA, secondsLeft: CLOCK_URGENT_S + 1 }
    expect(marksAfter(antes, { ...ARENA, secondsLeft: CLOCK_URGENT_S })).toBe('match-final-minute')
  })

  it('o último minuto anuncia uma vez só', () => {
    const marks = createMatchMarks()
    marks.since({ ...ARENA, secondsLeft: CLOCK_URGENT_S + 1 })
    marks.since({ ...ARENA, secondsLeft: CLOCK_URGENT_S })
    expect(marks.since({ ...ARENA, secondsLeft: CLOCK_URGENT_S - 1 })).toBeUndefined()
  })

  it('a partida que acaba, no relógio ou no limite de pontos, encerra a partida', () => {
    const over: MatchSituation = { ...ARENA, phase: 'over', secondsLeft: 0 }
    expect(marksAfter({ ...ARENA, secondsLeft: 1 }, over)).toBe('match-end')
    expect(marksAfter({ ...ARENA, secondsLeft: 200 }, over)).toBe('match-end')
  })

  it('o fim ganha do último minuto quando os dois cruzam no mesmo quadro', () => {
    const antes = { ...ARENA, secondsLeft: CLOCK_URGENT_S + 1 }
    expect(marksAfter(antes, { ...ARENA, phase: 'over', secondsLeft: 0 })).toBe('match-end')
  })

  it('o intervalo não repete o fim', () => {
    const over: MatchSituation = { ...ARENA, phase: 'over', secondsLeft: 0 }
    expect(marksAfter(over, { ...over, phase: 'results' })).toBeUndefined()
  })

  it('no treino nenhum marco sai', () => {
    const treino: MatchSituation = { ...ARENA, mode: 'training', secondsLeft: 0 }
    expect(marksAfter({ ...treino, secondsLeft: 1 }, { ...treino, phase: 'over' })).toBeUndefined()
  })

  /** Online: entrar na arena no aquecimento não é o começo, o fim dele é. */
  it('o aquecimento não começa a partida; o fim dele começa', () => {
    const warmup: MatchSituation = { ...ARENA, phase: 'warmup', secondsLeft: 12 }
    expect(marksAfter(MENU, warmup)).toBeUndefined()
    expect(marksAfter(warmup, ARENA)).toBe('match-start')
  })

  it('sair para o menu e voltar anuncia o começo de novo', () => {
    const marks = createMatchMarks()
    marks.since(ARENA)
    marks.since(MENU)
    expect(marks.since(ARENA)).toBe('match-start')
  })

  it('a partida seguinte, sem sair da arena, anuncia o começo de novo', () => {
    const decided: MatchSituation = { ...ARENA, phase: 'decided', secondsLeft: 0 }
    expect(marksAfter(decided, ARENA)).toBe('match-start')
  })
})
