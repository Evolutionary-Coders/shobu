import type { MatchPhase } from '@shobu/core'
import { CLOCK_URGENT_S, type SessionMode } from '../hud/matchClock.ts'

/**
 * Os marcos de partida que o narrador comenta, lidos como borda entre dois
 * quadros — o mesmo desenho do `arenaSoundCues.ts`. O começo e o fim são
 * bordas da fase da partida (ADR 0031): o começo é a entrada em `live` — do
 * aquecimento, do intervalo, ou do menu —, e o fim é a saída dela para `over`,
 * que cobre o limite de pontos, que nunca cruza o zero do relógio.
 *
 * **No treino não há marco nenhum.** O relógio fica congelado ali
 * (`matchClock.ts`), e um narrador anunciando "um minuto restante" num
 * cronômetro parado seria a tela contando o que ela acabou de dizer que não
 * conta.
 *
 * ```ts
 * marks.since({ inArena: true, mode: 'match', phase: 'live', secondsLeft: 59 })
 * // 'match-final-minute'
 * ```
 */
export type MatchMark = 'match-start' | 'match-final-minute' | 'match-end'

export interface MatchSituation {
  readonly inArena: boolean
  readonly mode: SessionMode
  readonly phase: MatchPhase
  /** O que falta da fase (`matchSecondsLeft`): é o último minuto que se lê daqui. */
  readonly secondsLeft: number
}

interface PreviousSituation {
  inArena: boolean
  phase: MatchPhase
  secondsLeft: number
}

export interface MatchMarks {
  since(situation: Readonly<MatchSituation>): MatchMark | undefined
}

export function createMatchMarks(): MatchMarks {
  const previous: PreviousSituation = {
    inArena: false,
    phase: 'live',
    secondsLeft: Number.POSITIVE_INFINITY,
  }
  return {
    since: (situation) => {
      const mark = markFor(previous, situation)
      previous.inArena = situation.inArena
      previous.phase = situation.phase
      previous.secondsLeft = situation.secondsLeft
      return mark
    },
  }
}

function markFor(
  previous: Readonly<PreviousSituation>,
  situation: Readonly<MatchSituation>,
): MatchMark | undefined {
  if (!situation.inArena || situation.mode === 'training') return undefined
  if (situation.phase !== 'live') return endMarkFor(previous, situation)
  // a partida seguinte começa sem sair da arena: do intervalo, ou do
  // aquecimento online, a fase volta a `live` sem passar pelo menu.
  if (!previous.inArena || previous.phase !== 'live') return 'match-start'
  if (crossed(previous.secondsLeft, situation.secondsLeft, CLOCK_URGENT_S)) {
    return 'match-final-minute'
  }
  return undefined
}

/** O fim é a saída de `live` para `over`: o intervalo que segue não repete o marco. */
function endMarkFor(
  previous: Readonly<PreviousSituation>,
  situation: Readonly<MatchSituation>,
): MatchMark | undefined {
  return previous.phase === 'live' && situation.phase === 'over' ? 'match-end' : undefined
}

/** O relógio anda para trás: cruzar é passar de acima do limiar para nele ou abaixo. */
function crossed(before: number, now: number, threshold: number): boolean {
  return before > threshold && now <= threshold
}
