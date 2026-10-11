import { describe, expect, it } from 'vitest'
import { CLOCK_URGENT_S } from '../hud/matchClock.ts'
import { createMatchMarks, type MatchSituation } from './matchMarks.ts'

const MENU: MatchSituation = { inArena: false, mode: 'match', secondsLeft: 300 }
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

  it('zerar o relógio encerra a partida', () => {
    expect(marksAfter({ ...ARENA, secondsLeft: 1 }, { ...ARENA, secondsLeft: 0 })).toBe('match-end')
  })

  it('o fim ganha do último minuto quando os dois cruzam no mesmo quadro', () => {
    const antes = { ...ARENA, secondsLeft: CLOCK_URGENT_S + 1 }
    expect(marksAfter(antes, { ...ARENA, secondsLeft: -1 })).toBe('match-end')
  })

  it('no treino o relógio está parado, e nenhum marco sai', () => {
    const treino: MatchSituation = { ...ARENA, mode: 'training', secondsLeft: 0 }
    expect(marksAfter({ ...treino, secondsLeft: 1 }, treino)).toBeUndefined()
  })

  it('sair para o menu e voltar anuncia o começo de novo', () => {
    const marks = createMatchMarks()
    marks.since(ARENA)
    marks.since(MENU)
    expect(marks.since(ARENA)).toBe('match-start')
  })
})
