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
 * // 'Protocol_Seven'
 * ```
 */
export interface MusicSituation {
  readonly inArena: boolean
  readonly mode: SessionMode
  readonly secondsLeft: number
  readonly matchOver: boolean
}

/** O tema do menu. Volta no fim da partida, que é para onde o jogador volta. */
export const MENU_TRACK: MusicTrack = 'Chrome_Perimeter'
export const ARENA_TRACK: MusicTrack = 'Blackout_Velocity'
/** Casada com a `match-final-minute` do narrador: a tela e a fala concordam. */
export const FINAL_MINUTE_TRACK: MusicTrack = 'Protocol_Seven'

export function musicFor(situation: MusicSituation): MusicTrack {
  if (!situation.inArena || situation.matchOver) return MENU_TRACK
  // no treino o relógio está congelado, então "último minuto" não quer dizer
  // nada ali: a faixa da arena vale a sessão inteira.
  if (situation.mode === 'training') return ARENA_TRACK
  if (situation.secondsLeft <= CLOCK_URGENT_S) return FINAL_MINUTE_TRACK
  return ARENA_TRACK
}
