import { CLOCK_URGENT_S, type SessionMode } from '../hud/matchClock.ts'
import type { MusicTrack } from './soundCatalog.ts'

/**
 * Qual faixa deveria estar tocando, dado onde o jogador está.
 *
 * Função pura de uma situação para uma faixa, e não uma máquina de estados: o
 * mixer já ignora pedido de tocar o que já toca, então o programa pode ser
 * recalculado por quadro sem picotar nada. O estado de "o que está no ar" mora
 * no `musicStream.ts`, que é quem sabe cruzar.
 *
 * ```ts
 * musicFor({ inArena: true, mode: 'match', secondsLeft: 40, matchOver: false })
 * // 'Point_Blank_Pursuit'
 * ```
 */
export interface MusicSituation {
  readonly inArena: boolean
  readonly mode: SessionMode
  readonly secondsLeft: number
  readonly matchOver: boolean
}

/**
 * O tema do menu. Volta no fim da partida, que é para onde o jogador volta. Os
 * dez segundos de abertura mais baixos (-17 dB contra -11 do corpo) são a
 * entrada de quem acabou de abrir a página.
 */
export const MENU_TRACK: MusicTrack = 'Iron_Teeth'
/**
 * A faixa que mais toca. Escolhida por ser a que menos disputa com o jogo: a
 * dinâmica mais plana das seis (LRA 3,2 LU), o peso no grave e o mínimo de
 * energia entre 2 e 6 kHz, que é a faixa do passo, do tiro e do narrador.
 */
export const ARENA_TRACK: MusicTrack = 'Midnight_Pursuit'
/**
 * Casada com a `match-final-minute` do narrador: a tela e a fala concordam. A
 * mais rápida (~152 BPM) e com subidas, para o relógio acelerar com ela.
 */
export const FINAL_MINUTE_TRACK: MusicTrack = 'Point_Blank_Pursuit'

export function musicFor(situation: MusicSituation): MusicTrack {
  if (!situation.inArena || situation.matchOver) return MENU_TRACK
  // no treino o relógio está congelado, então "último minuto" não quer dizer
  // nada ali: a faixa da arena vale a sessão inteira.
  if (situation.mode === 'training') return ARENA_TRACK
  if (situation.secondsLeft <= CLOCK_URGENT_S) return FINAL_MINUTE_TRACK
  return ARENA_TRACK
}
