/**
 * O cronômetro da partida. Dado puro: quem escreve no dom é o `arenaHud.ts`, e
 * quem anima é o css — javascript no laço de quadro disputa o quadro com o
 * render (nfr.md).
 */
export type ClockTone = 'calm' | 'urgent' | 'final'

/**
 * Como a partida conta o tempo.
 *
 * `training` é o campo de treino: sem cronômetro, porque treinar contra um
 * relógio que zera sem consequência nenhuma é relógio mentindo. É este mesmo
 * tipo que separa os dois no fim de partida: só a partida acaba no relógio
 * (`MatchRules.timed`, ADR 0022).
 */
export type SessionMode = 'match' | 'training'

/** O que o relógio mostra no treino, no lugar da contagem. */
export const TRAINING_CLOCK_LABEL = 'TREINO'

/**
 * O texto do relógio para o modo. No treino o número sai de cena inteiro: um
 * contador parado em `05:00` seria pior que nenhum.
 *
 * ```ts
 * clockLabel('training', 300) // 'TREINO'
 * ```
 */
export function clockLabel(mode: SessionMode, secondsLeft: number): string {
  return mode === 'training' ? TRAINING_CLOCK_LABEL : formatMatchClock(secondsLeft)
}

/**
 * O relógio em caixinhas, como o `[100][00]` do Metal Gear Rising: minutos
 * numa, segundos na outra, e a palavra TREINO numa só.
 *
 * ```ts
 * clockBoxes('match', 300)   // ['05', '00']
 * clockBoxes('training', 300) // ['TREINO']
 * ```
 */
export function clockBoxes(mode: SessionMode, secondsLeft: number): readonly string[] {
  return clockLabel(mode, secondsLeft).split(':')
}

/** Último minuto: a leitura muda de tom, não de tamanho. */
export const CLOCK_URGENT_S = 60

/** Últimos dez segundos. */
export const CLOCK_FINAL_S = 10

/**
 * `Math.ceil` e não `floor`: com `floor`, o primeiro quadro de uma partida de
 * 300 s mostra `04:59`, e todo jogador que já viu um relógio lê isso como
 * defeito.
 *
 * ```ts
 * formatMatchClock(300) // '05:00'
 * formatMatchClock(0.2) // '00:01'
 * ```
 */
export function formatMatchClock(secondsLeft: number): string {
  if (!Number.isFinite(secondsLeft)) {
    throw new RangeError(`secondsLeft recebeu ${secondsLeft}; esperado número finito`)
  }
  const whole = Math.max(0, Math.ceil(secondsLeft))
  const minutes = Math.floor(whole / 60)
  const seconds = whole % 60
  return `${pad(minutes)}:${pad(seconds)}`
}

export function clockTone(secondsLeft: number): ClockTone {
  if (secondsLeft <= CLOCK_FINAL_S) return 'final'
  if (secondsLeft <= CLOCK_URGENT_S) return 'urgent'
  return 'calm'
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}
