import { describe, expect, it } from 'vitest'
import {
  createRoomMatchView,
  matchStateOf,
  officialScoresOf,
  type RoomMatchFields,
  readRoomMatch,
} from './roomMatchView.ts'

const WARMUP: RoomMatchFields = {
  phase: 0,
  phaseLeftDs: 120,
  arenaId: 'neon-kaido',
  ballots: new Map(),
  winner: -1,
  nextArenaId: '',
}

describe('readRoomMatch', () => {
  it('lê a fase e os segundos do fio, com o voto aberto', () => {
    const view = readRoomMatch(WARMUP, createRoomMatchView())
    expect(view).toEqual({
      phase: 'warmup',
      phaseLeftS: 12,
      arenaId: 'neon-kaido',
      winner: undefined,
      nextArenaId: undefined,
    })
  })

  it('lê o voto fechado no mesmo objeto, sem alocar', () => {
    const view = createRoomMatchView()
    const decided = { ...WARMUP, phase: 4, winner: 2, nextArenaId: 'ichiban-gai' }
    expect(readRoomMatch(decided, view)).toBe(view)
    expect(view).toMatchObject({ phase: 'decided', winner: 2, nextArenaId: 'ichiban-gai' })
  })
})

describe('o estado da sala', () => {
  it('sem estado, nem partida nem placar', () => {
    expect(matchStateOf(undefined)).toBeUndefined()
    expect(officialScoresOf(undefined).size).toBe(0)
  })

  it('a partida e o placar são os do estado', () => {
    const players = new Map([['eu', { points: 1, kills: 1, deaths: 0, streakPoints: 1 }]])
    expect(matchStateOf({ match: WARMUP })).toBe(WARMUP)
    expect(officialScoresOf({ players })).toBe(players)
  })
})
