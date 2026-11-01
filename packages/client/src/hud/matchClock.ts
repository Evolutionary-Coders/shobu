import { type MatchConfig, type MatchCycle, matchPhaseFrozen, matchPhaseLeftS } from '@shobu/core'

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

/**
 * O que o relógio conta agora: o modo do menu, ou o aquecimento antes da
 * partida (ADR 0031), que conta os segundos dele com outro nome.
 */
export type ClockMode = SessionMode | 'warmup'

/** O que o relógio mostra no treino, no lugar da contagem. */
export const TRAINING_CLOCK_LABEL = 'TREINO'

/** O nome do aquecimento no relógio, ao lado dos segundos que faltam para a partida. */
export const WARMUP_CLOCK_LABEL = 'AQUECIMENTO'

/**
 * O modo do relógio: no aquecimento a partida conta outra coisa. O treino é
 * treino sempre, até quando a sala aquece.
 *
 * ```ts
 * clockModeOf('match', true) // 'warmup'
 * ```
 */
export function clockModeOf(mode: SessionMode, warmup: boolean): ClockMode {
  return warmup && mode === 'match' ? 'warmup' : mode
}

/**
 * Os segundos que o relógio mostra: os da fase de agora (`matchPhaseLeftS`),
 * e zero com a arena congelada, que é a partida já acabada — a contagem do
 * voto é da tela de MVP. Sem relógio (o treino), a duração cheia: o número
 * nunca aparece, mas segue finito para quem o formata.
 *
 * ```ts
 * matchSecondsLeft(session.matchCycle, config.match) // 287.4
 * ```
 */
export function matchSecondsLeft(cycle: Readonly<MatchCycle>, match: MatchConfig): number {
  if (matchPhaseFrozen(cycle)) return 0
  const leftS = matchPhaseLeftS(cycle, match)
  return Number.isFinite(leftS) ? leftS : match.durationS
}

/**
 * O texto do relógio para o modo. No treino o número sai de cena inteiro: um
 * contador parado em `05:00` seria pior que nenhum.
 *
 * ```ts
 * clockLabel('training', 300) // 'TREINO'
 * clockLabel('warmup', 11.2)  // 'AQUECIMENTO 12'
 * ```
 */
export function clockLabel(mode: ClockMode, secondsLeft: number): string {
  if (mode === 'training') return TRAINING_CLOCK_LABEL
  if (mode === 'warmup') return clockBoxes(mode, secondsLeft).join(' ')
  return formatMatchClock(secondsLeft)
}

/**
 * O relógio em caixinhas, como o `[100][00]` do Metal Gear Rising: minutos
 * numa, segundos na outra, a palavra TREINO numa só, e no aquecimento o nome
 * numa e os segundos na outra.
 *
 * ```ts
 * clockBoxes('match', 300)   // ['05', '00']
 * clockBoxes('training', 300) // ['TREINO']
 * clockBoxes('warmup', 9.5)   // ['AQUECIMENTO', '10']
 * ```
 */
export function clockBoxes(mode: ClockMode, secondsLeft: number): readonly string[] {
  if (mode === 'warmup') return [WARMUP_CLOCK_LABEL, pad(wholeSecondsLeft(secondsLeft))]
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
  const whole = wholeSecondsLeft(secondsLeft)
  const minutes = Math.floor(whole / 60)
  const seconds = whole % 60
  return `${pad(minutes)}:${pad(seconds)}`
}

export function clockTone(secondsLeft: number): ClockTone {
  if (secondsLeft <= CLOCK_FINAL_S) return 'final'
  if (secondsLeft <= CLOCK_URGENT_S) return 'urgent'
  return 'calm'
}

function wholeSecondsLeft(secondsLeft: number): number {
  return Math.max(0, Math.ceil(secondsLeft))
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}
