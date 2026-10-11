import { describe, expect, it } from 'vitest'
import { CLOCK_URGENT_S } from '../hud/matchClock.ts'
import {
  ARENA_TRACK,
  FINAL_MINUTE_TRACK,
  MENU_TRACK,
  type MusicSituation,
  musicFor,
} from './musicProgram.ts'

const IN_MATCH: MusicSituation = {
  inArena: true,
  mode: 'match',
  secondsLeft: 300,
  matchOver: false,
}

describe('musicFor', () => {
  it('no menu toca o tema do menu', () => {
    expect(musicFor({ ...IN_MATCH, inArena: false })).toBe(MENU_TRACK)
  })

  it('na partida toca a faixa da arena', () => {
    expect(musicFor(IN_MATCH)).toBe(ARENA_TRACK)
  })

  it('no último minuto a faixa vira a do fim', () => {
    expect(musicFor({ ...IN_MATCH, secondsLeft: CLOCK_URGENT_S - 1 })).toBe(FINAL_MINUTE_TRACK)
  })

  it('a virada é no mesmo segundo em que o relógio muda de tom', () => {
    expect(musicFor({ ...IN_MATCH, secondsLeft: CLOCK_URGENT_S })).toBe(FINAL_MINUTE_TRACK)
    expect(musicFor({ ...IN_MATCH, secondsLeft: CLOCK_URGENT_S + 1 })).toBe(ARENA_TRACK)
  })

  it('fim de partida devolve o jogador ao tema do menu', () => {
    expect(musicFor({ ...IN_MATCH, secondsLeft: 0, matchOver: true })).toBe(MENU_TRACK)
  })

  it('no treino o relógio está parado, então o último minuto não existe', () => {
    const treino: MusicSituation = { ...IN_MATCH, mode: 'training', secondsLeft: 0 }
    expect(musicFor(treino)).toBe(ARENA_TRACK)
  })

  it('as três faixas do jogo são usadas, e nenhuma sobra', () => {
    expect(new Set([MENU_TRACK, ARENA_TRACK, FINAL_MINUTE_TRACK]).size).toBe(3)
  })
})
