import { CLOCK_URGENT_S, type SessionMode } from '../hud/matchClock.ts'

/**
 * Os marcos de partida que o narrador comenta, lidos como borda entre dois
 * quadros — o mesmo desenho do `arenaSoundCues.ts`.
 *
 * **No treino não há marco nenhum.** O relógio fica congelado ali
 * (`matchClock.ts`), e um narrador anunciando "um minuto restante" num
 * cronômetro parado seria a tela contando o que ela acabou de dizer que não
 * conta.
 *
 * ```ts
 * marks.since({ inArena: true, mode: 'match', secondsLeft: 59 })
 * // 'match-final-minute'
 * ```
 */
export type MatchMark = 'match-start' | 'match-final-minute' | 'match-end'

export interface MatchSituation {
  readonly inArena: boolean
  readonly mode: SessionMode
  readonly secondsLeft: number
}

export interface MatchMarks {
  since(situation: Readonly<MatchSituation>): MatchMark | undefined
}

export function createMatchMarks(): MatchMarks {
  const previous = { inArena: false, secondsLeft: Number.POSITIVE_INFINITY }
  return {
    since: (situation) => {
      const mark = markFor(previous, situation)
      previous.inArena = situation.inArena
      previous.secondsLeft = situation.secondsLeft
      return mark
    },
  }
}

function markFor(
  previous: { inArena: boolean; secondsLeft: number },
  situation: Readonly<MatchSituation>,
): MatchMark | undefined {
  if (!situation.inArena || situation.mode === 'training') return undefined
  if (!previous.inArena) return 'match-start'
  if (crossed(previous.secondsLeft, situation.secondsLeft, 0)) return 'match-end'
  if (crossed(previous.secondsLeft, situation.secondsLeft, CLOCK_URGENT_S)) {
    return 'match-final-minute'
  }
  return undefined
}

/** O relógio anda para trás: cruzar é passar de acima do limiar para nele ou abaixo. */
function crossed(before: number, now: number, threshold: number): boolean {
  return before > threshold && now <= threshold
}
